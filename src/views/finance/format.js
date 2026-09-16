/** Formateo compartido por las pestañas del libro contable. */

const SIMBOLO_MONEDA = { soles: 'S/', dolares: 'US$' };

export function formatAmount(value) {
  return Number(value || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function currencySymbol(moneda) {
  return SIMBOLO_MONEDA[moneda] || 'S/';
}

/**
 * Las fechas llegan del API como ISO en UTC (`2026-09-14T00:00:00.000Z`) pero
 * representan un día de calendario, no un instante: construir un `Date` con
 * ellas las corría un día hacia atrás en la zona horaria de Perú. Se formatea
 * directamente desde el tramo `AAAA-MM-DD`.
 */
export function formatDate(value) {
  const [year, month, day] = dayOnly(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
}

/** Tramo `AAAA-MM-DD` de una fecha del API, apto para ordenar y para inputs. */
export function dayOnly(value) {
  return String(value || '').slice(0, 10);
}
