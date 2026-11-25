/**
 * Meses calendario para el filtro de Campañas.
 *
 * Los límites van en hora de Lima (-05:00, sin horario de verano) y no en la
 * del navegador: un lead que entró el 31 a las 22:00 en Lima ya es día 1 en
 * UTC, y con el huso del navegador caería en el mes equivocado.
 */
import { limaDay } from './leadCardDate.js';

const LIMA_OFFSET = '-05:00';

/** `YYYY-MM` del mes en curso en Lima. */
export function currentLimaMonth() {
  return limaDay(new Date()).slice(0, 7);
}

/** `YYYY-MM` desplazado `delta` meses. */
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Rango del mes: desde el día 1 a las 00:00 de Lima hasta el último
 * milisegundo del mes (el backend compara `<= to`, inclusivo).
 */
export function monthRange(ym) {
  const from = new Date(`${ym}-01T00:00:00${LIMA_OFFSET}`);
  const next = new Date(`${shiftMonth(ym, 1)}-01T00:00:00${LIMA_OFFSET}`);
  return { from, to: new Date(next.getTime() - 1) };
}

/** "noviembre 2026". */
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' });
  return `${name} ${y}`;
}

/** Los últimos `count` meses, el actual primero. */
export function recentMonths(count = 12, from = currentLimaMonth()) {
  return Array.from({ length: count }, (_, i) => {
    const value = shiftMonth(from, -i);
    return { value, label: monthLabel(value) };
  });
}
