/**
 * Ficha académica del lead con valores cerrados + filtro de calificación.
 *
 * El LLM extrae lo que el contacto dice en lenguaje libre ("estoy en sexto",
 * "ya egresé", "me observaron el capítulo 2"); aquí se reduce a un catálogo
 * cerrado, para que el CRM no se llene de variantes del mismo dato y el
 * filtro de abajo decida con reglas fijas y no a criterio del modelo.
 *
 * Todo es puro (sin DB ni red) para poder probarlo directo.
 */

/** Grado de instrucción ACTUAL del contacto (qué es hoy, no qué busca). */
export const ACADEMIC_STATUSES = ['Estudiante', 'Egresado', 'Bachiller', 'Titulado', 'Magíster'];

/**
 * Situación de la tesis. Es el mismo catálogo del selector "Situación / tipo
 * de tesis" de la Base de Datos de leads (DatabaseView.vue), para que lo que
 * guarda el bot se vea y se edite ahí sin valores huérfanos.
 */
export const THESIS_SITUATIONS = [
  'Tesis sin avance',
  'Proyecto / Plan de Tesis',
  'Borrador de Tesis (Capítulos 1-3)',
  'Tesis Completa / En Revisión',
  'Levantamiento de Observaciones',
  'Asesoría Estadística / Resultados',
  'Artículo Científico',
  'Preparación para Sustentación'
];

// Pregrado: se atiende desde 8.º ciclo, cuando la mayoría de universidades
// habilita el curso de tesis.
export const MIN_ELIGIBLE_CYCLE = 8;

const INSTITUTE_RE = /\binstitut|\biestp?\b|\btecnol[oó]gico\b|\bpedag[oó]gico\b|\bsenati\b|\bsencico\b/i;
const UNIVERSITY_RE = /\buniversidad\b|\buniversity\b/i;

// En institutos solo se atienden carreras administrativas y de educación.
const INSTITUTE_ELIGIBLE_FIELD_RE = /administ|negocio|gesti[oó]n|contab|finanz|marketing|mercadotecnia|comerci|educaci|pedagog|docen|profesor|inicial|primaria|secundaria/i;

function flatten(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** "egresada" → "Egresado"; lo que no calce con el catálogo → null. */
export function normalizeAcademicStatus(value) {
  const text = flatten(value);
  if (!text) return null;
  if (/magist|maestr/.test(text)) return 'Magíster';
  if (/titulad|licenciad/.test(text)) return 'Titulado';
  if (/bachiller/.test(text)) return 'Bachiller';
  if (/egresad/.test(text)) return 'Egresado';
  if (/estudiante|estudio|cursando|ciclo/.test(text)) return 'Estudiante';
  return null;
}

/** Acepta solo un valor exacto del catálogo (sin distinguir tildes/mayúsculas). */
export function normalizeThesisSituation(value) {
  const text = flatten(value);
  if (!text) return null;
  return THESIS_SITUATIONS.find((option) => flatten(option) === text) || null;
}

/** 8, "8", "8vo" → 8. Fuera de 1–14 (no es un ciclo real) → null. */
export function normalizeCycle(value) {
  const match = String(value ?? '').match(/\d{1,2}/);
  const cycle = match ? Number(match[0]) : NaN;
  return cycle >= 1 && cycle <= 14 ? cycle : null;
}

/** ¿La institución que nombró es un instituto (no universidad)? */
export function isInstitute(institution) {
  const text = String(institution || '');
  return INSTITUTE_RE.test(text) && !UNIVERSITY_RE.test(text);
}

/**
 * Decide si el lead puede pasar a agendar. Devuelve:
 *   { status: 'qualified' }
 *   { status: 'missing', ask: 'cycle' | 'field' } — falta el dato que decide
 *   { status: 'rejected', reason: 'low_cycle' | 'institute_field' }
 *
 * Posgrado (maestría/doctorado) no pasa por el filtro de ciclo: el ciclo es
 * de pregrado.
 */
export function evaluateQualification({ academicStatus, cycle, university, field, level }) {
  if (isInstitute(university)) {
    if (!field) return { status: 'missing', ask: 'field' };
    if (!INSTITUTE_ELIGIBLE_FIELD_RE.test(flatten(field))) return { status: 'rejected', reason: 'institute_field' };
  }

  const isPostgrad = /posgrado|maestr|doctor/i.test(String(level || ''));
  if (academicStatus === 'Estudiante' && !isPostgrad) {
    if (cycle == null) return { status: 'missing', ask: 'cycle' };
    if (cycle < MIN_ELIGIBLE_CYCLE) return { status: 'rejected', reason: 'low_cycle' };
  }

  return { status: 'qualified' };
}
