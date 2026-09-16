/**
 * Backfill único: completa grado académico / universidad / carrera de los
 * leads que ya se importaron desde un formulario instantáneo de Meta Lead
 * Ads (metaWebhookService.importLead()) ANTES de que ese método empezara a
 * guardar esas respuestas — se quedaron con los valores por defecto
 * ("Pregrado (Bachiller/Título)", "General", sin universidad) aunque la
 * persona sí las hubiera contestado en el formulario.
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
import { extractCustomFields } from '../services/metaWebhookService.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const LEADGEN_MARKER_RE = /\[Meta leadgen_id=(\d+)\]/;
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

  const result = { totalFound: leads.length, updated: [], skipped: 0, failed: [] };

  for (const lead of leads) {
    const match = String(lead.additional_notes || '').match(LEADGEN_MARKER_RE);
    if (!match) { result.skipped++; continue; }
    const leadgenId = match[1];

    const missingAcademicLevel = !lead.academic_level || lead.academic_level === DEFAULT_ACADEMIC_LEVEL;
    const missingFieldOfStudy = !lead.field_of_study || lead.field_of_study === DEFAULT_FIELD_OF_STUDY;
    const missingUniversity = !lead.university;
    if (!missingAcademicLevel && !missingFieldOfStudy && !missingUniversity) {
      result.skipped++;
      continue;
    }

    try {
      const fieldData = await fetchFieldData(leadgenId, token);
      const custom = extractCustomFields(fieldData);

      const patch = {};
      if (missingAcademicLevel && custom.academicLevel) patch.academic_level = custom.academicLevel;
      if (missingFieldOfStudy && custom.fieldOfStudy) patch.field_of_study = custom.fieldOfStudy;
      if (missingUniversity && custom.university) patch.university = custom.university;
      if (custom.progressNote && !String(lead.additional_notes).includes('Avance declarado en el formulario:')) {
        patch.additional_notes = `${lead.additional_notes} | Avance declarado en el formulario: ${custom.progressNote}`;
      }

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
