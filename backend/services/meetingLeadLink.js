/**
 * A qué lead pertenece una reunión cargada a mano sin lead.
 *
 * Desde el Calendario no hay ficha a mano, así que la reunión nacía con
 * `lead_id` en null aunque quien la cargaba escribiera el celular del cliente
 * en el tema ("51999888777 // Ing. Civil // UNCP"). Sin el enlace,
 * esa reunión no existe para nada de lo que mide el funnel: el Reporte de
 * Setters la contaba en cero (caso de Mishel, 25/11/2026), Campañas no la
 * cruzaba con su anuncio y el lead seguía pareciendo sin cita.
 *
 * Se enlaza solo cuando la evidencia apunta a UN lead (por los últimos 9
 * dígitos, el mismo criterio que `findByPhone`, o por el correo del invitado).
 * Dos candidatas no se resuelven por descarte: coincidir no es identificar, y
 * atarle la reunión al lead equivocado es peor que dejarla suelta.
 */
import { db } from '../db/connection.js';
import { PHONE_MATCH_KEY_SQL, phoneMatchKey } from './leadService.js';

/**
 * Las claves de teléfono (últimos 9 dígitos) escritas en un texto libre. Solo
 * cuentan corridas de 9 a 13 dígitos (con espacios, guiones o paréntesis en
 * medio): menos es una fecha o un DNI, más es otra cosa.
 */
export function phoneKeysInText(...texts) {
  const keys = new Set();
  for (const text of texts) {
    for (const match of String(text || '').match(/\+?\d[\d\s\-().]{6,}\d/g) || []) {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 13) continue;
      const key = phoneMatchKey(digits);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

/** El id del único lead al que apunta la reunión, o null. */
export async function resolveLeadForMeeting({ contactName = null, topic = null, attendeeEmail = null } = {}) {
  const ids = new Set();
  const keys = phoneKeysInText(contactName, topic);
  if (keys.length) {
    const rows = await db('leads').whereRaw(`${PHONE_MATCH_KEY_SQL} IN (${keys.map(() => '?').join(',')})`, keys).select('id');
    rows.forEach((r) => ids.add(r.id));
  }
  const email = String(attendeeEmail || '').trim().toLowerCase();
  if (email.includes('@')) {
    const rows = await db('leads').whereRaw('LOWER(TRIM(email)) = ?', [email]).select('id');
    rows.forEach((r) => ids.add(r.id));
  }
  return ids.size === 1 ? [...ids][0] : null;
}
