import { PERU_UNIVERSITIES } from '../data/peruUniversities.js';

function normalizeToken(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Busca `rawText` en el catálogo cerrado, comparando por palabra completa
 * (no substring) para que alias cortos como "uni"/"unt" no matcheen dentro
 * de otra palabra ("universidad" contiene "uni" pero no debe confundirse).
 */
function matchCatalog(rawText) {
  const normalized = normalizeToken(rawText);
  if (!normalized) return null;

  for (const entry of PERU_UNIVERSITIES) {
    if (normalized === normalizeToken(entry.name)) return entry;
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeToken(alias);
      if (!normalizedAlias) continue;
      if (normalized === normalizedAlias) return entry;
      const wordBoundaryRe = new RegExp(`(?:^|\\s)${escapeRegExp(normalizedAlias)}(?:$|\\s)`);
      if (wordBoundaryRe.test(normalized)) return entry;
    }
  }
  return null;
}

/**
 * Resuelve una universidad peruana a partir de texto libre, dando prioridad
 * absoluta a un catálogo cerrado y determinístico antes de confiar en
 * cualquier respuesta del LLM: así "UNAC" nunca puede terminar confundida
 * con "UNCP", y "Villarreal" nunca con "San Marcos" — casos reales que
 * ocurrieron cuando la única fuente de verdad era una llamada al LLM
 * autoreportando su propia confianza.
 *
 * `resolveWithLLM(rawText)` es opcional: si se pasa, solo se invoca cuando el
 * catálogo no reconoce nada, y su resultado (`{name, confident}`) se vuelve a
 * validar contra el catálogo antes de aceptarse como confianza alta — un
 * `confident: true` que no calza con ninguna entrada real del catálogo baja
 * a confianza media en vez de aceptarse tal cual.
 *
 * Devuelve `{ name, confidence: 'alta'|'media'|'baja', source }`.
 * - alta: se puede confirmar la universidad tal cual.
 * - media: hay una corrección plausible pero sin verificar — preguntar antes
 *   de darla por buena.
 * - baja: no hay nada confiable que ofrecer — no mencionar ninguna
 *   universidad y quedarse con el texto tal cual escribió el contacto.
 */
export async function normalizeUniversity(rawText, { resolveWithLLM } = {}) {
  const catalogMatch = matchCatalog(rawText);
  if (catalogMatch) {
    return { name: catalogMatch.name, confidence: 'alta', source: 'catalogo' };
  }

  if (typeof resolveWithLLM !== 'function') {
    return { name: rawText, confidence: 'baja', source: 'sin_resolver' };
  }

  const resolved = await resolveWithLLM(rawText);
  if (!resolved?.confident || !resolved?.name) {
    return { name: rawText, confidence: 'baja', source: 'llm' };
  }

  const validated = matchCatalog(resolved.name);
  if (validated) return { name: validated.name, confidence: 'alta', source: 'llm_validado' };

  return { name: resolved.name, confidence: 'media', source: 'llm_sin_catalogo' };
}
