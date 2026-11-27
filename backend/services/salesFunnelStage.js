import { db } from '../db/connection.js';
import { isQuotedLabel } from './funnelColumnService.js';

/**
 * ¿Un lead ya "graduó" del Setter Funnel al Funnel de Ventas?
 *
 * Los dos tableros leen la MISMA columna `leads.status`, así que lo único que
 * separa un lead del setter de un lead comercial es el valor de ese campo. La
 * regla vivía duplicada en el frontend (`SETTER_ONLY_STATUSES` en
 * LeadsView.vue, `SALES_FUNNEL_STATUSES` en SetterFunnelView.vue) y en
 * contractService, y el bot de WhatsApp no la conocía en absoluto: por eso
 * podía congelar por inactividad a un lead que el closer ya estaba trabajando
 * y devolverlo al Setter Funnel en la columna "Congelados" (reporte del equipo
 * de ventas: leads en seguimiento, la mayoría ya cotizados, reapareciendo como
 * congelados). Este módulo es ahora el único lugar donde se responde esa
 * pregunta en el backend.
 *
 * La respuesta tiene dos partes y conviene no confundirlas:
 *
 *   - `isSalesFunnelStatus()` DETECTA la graduación leyendo el status. Solo
 *     sirve para eso, porque depende de que la columna siga existiendo.
 *   - `leadHasGraduated()` / `isLeadInSalesFunnel()` RECUERDAN la graduación:
 *     miran `leads.sales_funnel_at`, el sello que se escribe al entrar al
 *     funnel comercial. Es el que hay que usar sobre un lead concreto.
 */

/**
 * Etapas que SOLO existen en el Setter Funnel: el bot todavía califica al
 * contacto y nadie del área comercial lo trabaja aún. `transferido_closer`
 * está acá a propósito — es un lead que el bot pasó a una persona SIN llegar a
 * agendar, así que sigue siendo del setter.
 */
export const SETTER_ONLY_STATUSES = ['conversacion_abierta', 'calificando', 'congelado', 'transferido_closer', 'descartado'];

/**
 * Etapas de bandeja de entrada: aparecen en la primera columna de AMBOS
 * tableros, así que no prueban nada. `nuevo` es además el status por defecto de
 * `leadService.createLead()`, con el que entran los leads del evaluador público
 * y de las campañas — justo los que el bot tiene que trabajar. Tratarlas como
 * "ya es comercial" dejaría al bot sin su trabajo principal.
 */
const INBOX_STATUSES = ['nuevo', 'inbox', 'abierto'];

/**
 * Etapas que significan "ya es un lead comercial" aunque el tablero de Ventas
 * no tenga una columna con ese nombre: `cita_agendada` es la que pone el bot (y
 * el pase manual del setter) al graduarlo, y las otras tres son los desenlaces
 * que el equipo puede dejar configurados con cualquier etiqueta.
 */
export const GRADUATED_STATUSES = ['cita_agendada', 'en_negociacion', 'ganado', 'perdido'];

/**
 * Conjunto de los status que hoy significan "está en el Funnel de Ventas".
 *
 * Las columnas del tablero de Ventas son configurables por el equipo y sus
 * claves se generan solas (`col_mtc2nwec_fij`), así que no se pueden listar en
 * el código: se leen de `funnel_columns`. Se consulta una vez y el resultado se
 * reparte entre todas las filas de un barrido, en vez de una consulta por lead.
 */
/**
 * Los status que significan "venta ganada".
 *
 * Son dos cosas a la vez: `ganado`, el desenlace fijo que usan las rutas y el
 * bot, y la clave de la columna que el equipo haya marcado como `final` en su
 * tablero (que puede llamarse "Cerrado" o "Matriculado"). Hay que preguntarlo
 * acá y no comparar contra la constante de `server.js`: el que renombra la
 * columna no sabe que de eso cuelga la comisión de la setter.
 */
/**
 * Los status que significan "esta venta no va a pasar".
 *
 * Son dos y no uno: `perdido` es el desenlace del Funnel de Ventas y
 * `descartado` el del Setter Funnel, y la pregunta "¿este lead se perdió?" se
 * hace sobre leads de los dos tableros.
 *
 * Y por eso van en DOS conjuntos y no en una sola lista: colapsados en un
 * contador, el reporte no deja distinguir el contacto que nunca llegó a ser
 * una oportunidad del cliente real que no compró —713 descartados del setter
 * contra 199 perdidos de ventas en el corte del 26/11/2026—, y a uno se le
 * corta el presupuesto del anuncio y al otro se le revisa el cierre. La unión
 * sigue publicándose porque es la que preguntan los tres reportes.
 *
 * Viven acá —con el resto del
 * vocabulario de `leads.status`— y no en cada pantalla que los necesite, por lo
 * mismo que `loadWinningStatuses()`: Campañas y el Reporte de Setters cuentan
 * leads perdidos del mismo universo, y con una lista por módulo basta que
 * alguien agregue un tercer desenlace para que cada uno diga un número
 * distinto.
 *
 * A diferencia de los ganados, son una constante y no una consulta: no cuelgan
 * de ninguna columna configurable (`funnel_columns.final` marca la etapa que
 * gana, no la que pierde), así que no hay nada que leer de la base.
 */
/**
 * El desenlace de pérdida del **Setter Funnel**: el contacto no llegó a ser
 * una oportunidad comercial.
 */
export const SETTER_DISCARD_STATUSES = new Set(['descartado']);

/**
 * El desenlace de pérdida del **Funnel de Ventas**: era un cliente real y no
 * compró.
 */
export const SALES_LOST_STATUSES = new Set(['perdido']);

/*
 * Los dos juntos, que es la pregunta "¿este lead se perdió?" y la que hacen
 * los tres reportes. Se deriva de los dos conjuntos de arriba y no se escribe
 * a mano: con la unión copiada, agregar un desenlace a uno de los dos lo
 * dejaría fuera de la pregunta general sin que nada falle a la vista.
 */
export const LOST_STATUSES = new Set([...SETTER_DISCARD_STATUSES, ...SALES_LOST_STATUSES]);

/** ¿Este status es un desenlace de pérdida, de cualquiera de los dos tableros? */
export function isLostStatus(status) {
  return LOST_STATUSES.has(status);
}

/** ¿Se descartó en el Setter Funnel (nunca llegó a ser oportunidad)? */
export function isSetterDiscardStatus(status) {
  return SETTER_DISCARD_STATUSES.has(status);
}

/** ¿Se perdió en el Funnel de Ventas (era un cliente real y no compró)? */
export function isSalesLostStatus(status) {
  return SALES_LOST_STATUSES.has(status);
}

/**
 * La etapa que afirma que hay una cita.
 *
 * Es un desenlace fijo y no una columna configurable: `cita_agendada` es el que
 * pone el bot al reservar el bloque, y de él cuelga que el reporte cuente una
 * cita. Vive acá —el módulo del vocabulario de `leads.status`, igual que
 * `LOST_STATUSES`— porque lo preguntan dos reportes: el de Campañas, para
 * contar las citas de un anuncio, y el de Setters, para señalar las que no
 * tienen reunión detrás. Con una copia en cada uno, el día que la etapa cambie
 * de nombre una de las dos pantallas deja de contarlas sin que nada falle.
 */
export const APPOINTMENT_STATUSES = new Set(['cita_agendada']);

/** ¿Este status dice que el lead tiene una cita? */
export function isAppointmentStatus(status) {
  return APPOINTMENT_STATUSES.has(status);
}

/**
 * Las etapas en las que el lead ya tiene una propuesta económica sobre la mesa.
 *
 * Se miran ADEMÁS de las tablas de cotizaciones y contratos porque el equipo
 * negocia por WhatsApp y a veces mueve la tarjeta antes de emitir el documento:
 * contando solo `quotes`, un lead que está cerrando trato aparece como si no
 * hubiera pasado de la primera conversación.
 *
 * Viven acá —con el resto del vocabulario de `leads.status`— y no en el reporte
 * que las necesita, por lo mismo que `LOST_STATUSES`: Campañas cuenta "leads en
 * cotización" por anuncio y el Reporte General cuenta el mismo paso en su
 * cadena de trazabilidad, así que con una lista por módulo basta que alguien
 * agregue una etapa para que cada pantalla diga un número distinto del mismo
 * lead.
 */
export const QUOTATION_STATUSES = new Set(['transferido_closer', 'en_negociacion']);

/** ¿Este status dice que ya hay una propuesta sobre la mesa? */
export function isQuotationStatus(status, quotationStatuses = QUOTATION_STATUSES) {
  return quotationStatuses.has(status);
}

export async function loadWinningStatuses() {
  const columns = await db('funnel_columns').where({ final: true }).select('key');
  return new Set(['ganado', ...columns.map((column) => column.key)]);
}

/**
 * Los status de propuesta más la columna de cotización que el equipo tenga
 * configurada en su tablero.
 *
 * Esa columna no se puede listar en el código: su clave la genera el servidor
 * (`col_mtc2nwec_fij`) y a cuál de todas se mueve un lead recién cotizado lo
 * decide `getQuotedColumn()` —la marca explícita `funnel_columns.quoted` y, si
 * nadie la puso, el nombre de la columna—. Se resuelve con la MISMA pregunta
 * que usa el movimiento automático al cotizar: si el reporte la contestara por
 * su cuenta, un lead podría estar en la etapa a la que el sistema mismo lo
 * movió y no contar como cotizado.
 */
export async function loadQuotationStatuses() {
  const statuses = new Set(QUOTATION_STATUSES);
  const flagged = await db('funnel_columns').where({ quoted: true }).select('key').first();
  if (flagged) {
    statuses.add(flagged.key);
    return statuses;
  }
  const columns = await db('funnel_columns').orderBy('position', 'asc').select('key', 'label');
  const byName = columns.find((column) => isQuotedLabel(column.label));
  if (byName) statuses.add(byName.key);
  return statuses;
}

export async function loadSalesFunnelStatuses() {
  const columns = await db('funnel_columns').select('key');
  const statuses = new Set(GRADUATED_STATUSES);
  for (const column of columns) {
    if (SETTER_ONLY_STATUSES.includes(column.key)) continue;
    if (INBOX_STATUSES.includes(column.key)) continue;
    statuses.add(column.key);
  }
  return statuses;
}

/**
 * ¿Este status es de un lead del Funnel de Ventas? `salesStatuses` es lo que
 * devuelve `loadSalesFunnelStatuses()`.
 *
 * Es la regla que DETECTA la graduación, no la que la recuerda: solo mira el
 * texto del status, así que deja de reconocer al lead en cuanto su columna se
 * borra o se recrea. Para preguntar "¿este lead es del closer?" hay que usar
 * `isLeadInSalesFunnel()`/`leadHasGraduated()`, que además miran el marcador.
 */
export function isSalesFunnelStatus(status, salesStatuses) {
  if (!status) return false;
  if (SETTER_ONLY_STATUSES.includes(status)) return false;
  if (INBOX_STATUSES.includes(status)) return false;
  return salesStatuses.has(status);
}

/**
 * ¿Este lead ya es del closer? Es la pregunta que hay que hacer sobre un lead
 * (y no `isSalesFunnelStatus`, que solo mira el texto del status).
 *
 * Manda `leads.sales_funnel_at`: el sello que se escribe cuando el lead entra
 * al funnel comercial y que solo borra una persona que lo devuelva a propósito
 * al setter. Sobrevive a que el equipo borre, renombre o recree la columna en
 * la que estaba el lead — justo el caso en el que la regla por status dejaba de
 * reconocerlo y el bot volvía a moverlo al Setter Funnel.
 *
 * El status se sigue mirando como respaldo, para los leads que ya estaban en el
 * funnel comercial antes de que existiera el sello.
 */
export function leadHasGraduated(lead, salesStatuses) {
  if (!lead) return false;
  if (lead.sales_funnel_at) return true;
  return isSalesFunnelStatus(lead.status, salesStatuses);
}

/** Atajo para un solo lead, cuando no hay un barrido del que colgarse. */
export async function isLeadInSalesFunnel(lead) {
  if (!lead) return false;
  if (lead.sales_funnel_at) return true;
  if (!lead.status) return false;
  return leadHasGraduated(lead, await loadSalesFunnelStatuses());
}
