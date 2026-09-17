/**
 * Opciones y cálculos que comparten la pestaña de INGRESOS y el desplegable
 * del plan de cobro. Deben coincidir con las constantes equivalentes del
 * backend (`backend/services/financeLedgerService.js`): si allá cambia la
 * lista, aquí el formulario dejaría de validar igual.
 */
export const CUOTAS = ["1era", "2da", "3era"];
export const EMITIR_OPCIONES = ["factura", "boleta", "nrus", "rxh", "c. interno"];
export const BANCOS = ["BCP", "Interbank", "Efectivo"];

/** ITF según la fórmula del Excel: IF(|monto|<1000, 0, INT(|monto|/1000)*0.05). */
export function calcItf(monto) {
  const a = Math.abs(Number(monto) || 0);
  if (a < 1000) return 0;
  return Math.round(Math.floor(a / 1000) * 0.05 * 100) / 100;
}

/** Clase del pill según la etapa del cobro (pendiente → pagado → verificado). */
export function estadoPillClass(estado) {
  if (estado === "verificado") return "pill-success";
  if (estado === "pagado") return "pill-info";
  return "pill-warning";
}
