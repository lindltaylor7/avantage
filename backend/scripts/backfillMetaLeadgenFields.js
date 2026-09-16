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
 * Uso: node backend/scripts/backfillMetaLeadgenFields.js
 * Requiere META_PAGE_ACCESS_TOKEN configurado en el .env del servidor.
 */
import dotenv from 'dotenv';
dotenv.config();

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

async function main() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ Falta META_PAGE_ACCESS_TOKEN en el .env — no se puede consultar la Graph API.');
    process.exit(1);
  }

  const leads = await db('leads').where('additional_notes', 'like', '%[Meta leadgen_id=%');
  console.log(`🔍 ${leads.length} lead(s) con marca de formulario de Meta encontrados.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const lead of leads) {
    const match = String(lead.additional_notes || '').match(LEADGEN_MARKER_RE);
    if (!match) { skipped++; continue; }
    const leadgenId = match[1];

    const missingAcademicLevel = !lead.academic_level || lead.academic_level === DEFAULT_ACADEMIC_LEVEL;
    const missingFieldOfStudy = !lead.field_of_study || lead.field_of_study === DEFAULT_FIELD_OF_STUDY;
    const missingUniversity = !lead.university;
    if (!missingAcademicLevel && !missingFieldOfStudy && !missingUniversity) {
      skipped++;
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
        console.log(`↩️  Lead #${lead.id} (leadgen_id=${leadgenId}): la Graph API no trajo nada nuevo que completar.`);
        skipped++;
        continue;
      }

      await db('leads').where({ id: lead.id }).update(patch);
      console.log(`✅ Lead #${lead.id} (leadgen_id=${leadgenId}) actualizado:`, patch);
      updated++;
    } catch (error) {
      console.error(`❌ Lead #${lead.id} (leadgen_id=${leadgenId}): ${error.message}`);
      failed++;
    }
  }

  console.log(`\nListo. Actualizados: ${updated} · Sin cambios: ${skipped} · Con error: ${failed}`);
  await db.destroy();
}

main().catch((error) => {
  console.error('❌ Error inesperado en el backfill:', error);
  process.exit(1);
});
