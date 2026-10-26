/**
 * Backfill: completa celular, correo, grado académico, universidad, carrera y
 * las demás respuestas de los leads que ya se importaron desde un formulario
 * de Meta Lead Ads (metaWebhookService.importLead()) con menos campos de los
 * que Meta había mandado — se quedaron con los valores por defecto
 * ("Pregrado (Bachiller/Título)", "General", sin universidad) o directamente
 * "Sin celular" aunque la persona sí los hubiera contestado.
 *
 * El caso del celular son los formularios que se contestan dentro de
 * Messenger o de Instagram: sus preguntas no usan la clave canónica de Meta
 * (`phone_number`) sino el texto de la pregunta, así que hasta el 26/10/2026
 * el importador solo guardaba el nombre (ver `metaLeadFields.js`).
 *
 * Vuelve a pedirle el `field_data` a la Graph API usando el `leadgen_id`
 * que ya quedó guardado en `additional_notes` de cada lead, y solo
 * completa los campos que todavía están vacíos o en su valor por
 * defecto — nunca pisa un dato que el equipo ya haya corregido a mano.
 *
 * `runMetaLeadgenBackfill()` se reutiliza desde POST
 * /api/leads/backfill-meta-fields (server.js) para que corra DENTRO del
 * proceso de la app ya arrancado por Passenger/Hostinger — ahí `db` y
 * `META_PAGE_ACCESS_TOKEN` ya están configurados correctamente. Correrlo
 * como script suelto por SSH (`node backend/scripts/backfillMetaLeadgenFields.js`)
 * requiere exportar esas mismas variables a mano en la sesión, porque un
 * proceso lanzado por SSH no hereda las variables de entorno que Hostinger
 * solo inyecta al proceso de la app.
 */
import { db } from '../db/connection.js';
import { extractMetaLeadForm, formatCustomFieldsNote } from '../services/metaLeadFields.js';
import { LeadService } from '../services/leadService.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const LEADGEN_MARKER_RE = /\[Meta leadgen_id=(\d+)\]/;
// El encabezado ("[Meta leadgen_id=...] form_id=...") es lo único del
// additional_notes original que se conserva siempre — el resto (el bloque
// de respuestas del formulario) se reconstruye entero en cada corrida para
// no arrastrar un formato viejo (p. ej. la primera versión de este backfill
// guardaba el avance tal cual venía de Meta, a veces en snake_case).
const HEADER_RE = /^\[Meta leadgen_id=\d+\]\s+form_id=\S+/;
const DEFAULT_ACADEMIC_LEVEL = 'Pregrado (Bachiller/Título)';
const DEFAULT_FIELD_OF_STUDY = 'General';

async function fetchFieldData(leadgenId, token) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}?fields=field_data&access_token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data.field_data || [];
}

export async function runMetaLeadgenBackfill() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('Falta META_PAGE_ACCESS_TOKEN en el entorno del servidor.');

  const leads = await db('leads').where('additional_notes', 'like', '%[Meta leadgen_id=%');

  const leadService = new LeadService();
  const result = { totalFound: leads.length, updated: [], skipped: 0, failed: [], phoneConflicts: [] };

  for (const lead of leads) {
    const match = String(lead.additional_notes || '').match(LEADGEN_MARKER_RE);
    if (!match) { result.skipped++; continue; }
    const leadgenId = match[1];

    const missingAcademicLevel = !lead.academic_level || lead.academic_level === DEFAULT_ACADEMIC_LEVEL;
    const missingFieldOfStudy = !lead.field_of_study || lead.field_of_study === DEFAULT_FIELD_OF_STUDY;
    const missingUniversity = !lead.university;
    // El celular es el que más falta hace: sin él la ficha no se puede llamar
    // y el lead no se cruza con el contacto que escriba después por WhatsApp.
    const missingPhone = !lead.phone;
    const missingEmail = !lead.email;
    if (!missingAcademicLevel && !missingFieldOfStudy && !missingUniversity && !missingPhone && !missingEmail) {
      result.skipped++;
      continue;
    }

    try {
      const fieldData = await fetchFieldData(leadgenId, token);
      const custom = extractMetaLeadForm(fieldData);

      const patch = {};
      if (missingAcademicLevel && custom.academicLevel) patch.academic_level = custom.academicLevel;
      if (missingFieldOfStudy && custom.fieldOfStudy) patch.field_of_study = custom.fieldOfStudy;
      if (missingUniversity && custom.university) patch.university = custom.university;
      if (missingEmail && custom.email) patch.email = custom.email;
      // Un celular rescatado puede ser el de un lead que ya existe (la ficha
      // sin teléfono nunca se pudo cruzar contra él). Escribirlo igual deja
      // dos fichas con el mismo número, que es justo lo que `findByPhone`
      // existe para evitar: ahí se informa y se deja la decisión al equipo.
      if (missingPhone && custom.phone) {
        const duplicado = await leadService.findByPhone(custom.phone);
        if (duplicado && duplicado.id !== lead.id) {
          result.phoneConflicts.push({ id: lead.id, leadgenId, phone: custom.phone, existingLeadId: duplicado.id });
        } else {
          patch.phone = custom.phone;
        }
      }

      // Notas: se reconstruyen con lo que YA quedó bien en el lead (si no
      // era el valor por defecto) más lo que se acaba de rescatar de Meta,
      // para que el bloque de respuestas del formulario quede completo y
      // legible sea cual sea el estado previo del lead.
      const merged = {
        academicLevel: patch.academic_level || (!missingAcademicLevel ? lead.academic_level : null),
        fieldOfStudy: patch.field_of_study || (!missingFieldOfStudy ? lead.field_of_study : null),
        university: patch.university || (!missingUniversity ? lead.university : null),
        progressNote: custom.progressNote || null,
        // Las respuestas sin campo propio en la ficha: antes se descartaban.
        extras: custom.extras || []
      };
      const headerMatch = String(lead.additional_notes || '').match(HEADER_RE);
      const header = headerMatch ? headerMatch[0] : `[Meta leadgen_id=${leadgenId}] form_id=desconocido`;
      const rebuiltNotes = [header, formatCustomFieldsNote(merged)].filter(Boolean).join('\n');
      if (rebuiltNotes !== lead.additional_notes) patch.additional_notes = rebuiltNotes;

      if (Object.keys(patch).length === 0) {
        result.skipped++;
        continue;
      }

      await db('leads').where({ id: lead.id }).update(patch);
      result.updated.push({ id: lead.id, leadgenId, patch });
    } catch (error) {
      result.failed.push({ id: lead.id, leadgenId, error: error.message });
    }
  }

  return result;
}

// Uso por CLI: node backend/scripts/backfillMetaLeadgenFields.js
// (requiere exportar META_PAGE_ACCESS_TOKEN y las variables DB_* a mano en
// la sesión — en Hostinger es más simple disparar esto por HTTP, ver arriba).
if (import.meta.url === `file://${process.argv[1]}`) {
  const dotenv = await import('dotenv');
  dotenv.config();

  runMetaLeadgenBackfill()
    .then((result) => {
      console.log(`🔍 ${result.totalFound} lead(s) con marca de formulario de Meta encontrados.`);
      for (const u of result.updated) console.log(`✅ Lead #${u.id} (leadgen_id=${u.leadgenId}) actualizado:`, u.patch);
      for (const f of result.failed) console.error(`❌ Lead #${f.id} (leadgen_id=${f.leadgenId}): ${f.error}`);
      console.log(`\nListo. Actualizados: ${result.updated.length} · Sin cambios: ${result.skipped} · Con error: ${result.failed.length}`);
      return db.destroy();
    })
    .catch((error) => {
      console.error('❌ Error inesperado en el backfill:', error);
      process.exit(1);
    });
}
