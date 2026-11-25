/**
 * La trazabilidad de un lead desde marketing hasta la caja: por qué pasos pasó,
 * **dónde se quedó** y quién tiene la pelota.
 *
 * El Reporte General ya tenía un embudo de cuatro pasos, y contestaba la mitad
 * de la pregunta: cuántos leads llegaron a cada etapa. La otra mitad —la que se
 * usa para decidir— es dónde se detiene el volumen, y un embudo acumulativo no
 * la dice: una barra que baja de 450 a 120 no distingue los 200 que nadie
 * contestó de los 130 que se descartaron con motivo. El primero es un problema
 * de atención y el segundo es el funnel funcionando.
 *
 * ## Dos lecturas del mismo lead, y la segunda es excluyente
 *
 * `reached` es acumulativo (cuántos pasaron por este paso) y `stuckOpen` /
 * `lost` son **excluyentes**: cada lead se cuenta en UN solo paso, el más lejos
 * que llegó. Esa es la propiedad que hace que las cifras cierren —la suma de
 * los parados, los perdidos y los que completaron la cadena es siempre el total
 * de la cohorte— y es lo único que permite afirmar que la comparación no se
 * dejó a nadie afuera. Es la misma idea de los cinco cajones de
 * `reconciliationBuckets.js`.
 *
 * Y el paso más lejos se calcula con un **máximo** y no con el primer paso que
 * falla: un lead ganado al que nadie le registró la primera respuesta igual
 * pasó por todos los pasos anteriores, y contarlo donde se cortó la cadena
 * daría un embudo que se ensancha hacia abajo (la misma razón por la que el
 * embudo anterior era acumulativo a propósito).
 *
 * ## Por qué estos pasos y no otros
 *
 * Cada paso es un **hecho registrado** cuya ausencia significa de verdad que no
 * ocurrió. Dos candidatos quedaron deliberadamente fuera de la cadena:
 *
 *  - **La calificación comercial** (`leads.qualified`) tiene tres estados y el
 *    vacío es "nadie lo revisó", no "no calificó". Puesta como paso, cada lead
 *    sin revisar se contaría como caído ahí y la cadena mostraría un precipicio
 *    donde solo falta registro.
 *  - **La asistencia a la reunión** (`scheduled_meetings.attendance`) es lo
 *    mismo: el `null` es "nadie lo registró" y son casi todas.
 *
 * Las dos viajan igual, como **anotaciones** al lado del paso al que
 * pertenecen: el dato se ve sin que invente una fuga. Es la misma distinción
 * que ya sostiene `attendanceUnknown` en el Reporte de Setters.
 *
 * ## Quién tiene la pelota
 *
 * Un lead parado en un paso está esperando el **siguiente**, así que el área
 * responsable de un lead trabado es la dueña del paso que falta y no la del
 * paso que alcanzó. De eso depende que la pantalla sirva para repartir trabajo
 * en vez de para repartir culpas: "40 leads esperando que Ventas cotice" es
 * accionable, "40 leads en la etapa de cita" no.
 *
 * Este módulo es **puro**: recibe los hechos ya resueltos (quién ganó, quién
 * tiene reunión, quién graduó) y no consulta nada. Las preguntas de vocabulario
 * —qué status significa ganado, qué significa graduado— se contestan donde ya
 * están contestadas (`salesFunnelStage.js`) y entran acá como predicados.
 */

/** Las áreas que se pasan el lead, en el orden en que lo tocan. */
export const TRACE_OWNERS = {
  marketing: { key: 'marketing', label: 'Marketing' },
  setter: { key: 'setter', label: 'Setter' },
  ventas: { key: 'ventas', label: 'Ventas' },
  finanzas: { key: 'finanzas', label: 'Finanzas' }
};

/**
 * La cadena, en orden. `owner` es quién hace ese paso; `waitingOn` —derivado,
 * no escrito— es quién tiene la pelota de un lead parado en el paso anterior.
 *
 * El orden de los dos primeros pasos comerciales (pasar a Ventas antes que la
 * cita) es el que ya tenía el embudo de esta pantalla. No es casual que
 * coincidan casi siempre: el bot gradúa al lead justo al reservar el bloque, y
 * ese tramo cercano al 100% es información —dice que el traspaso en sí no es la
 * fuga— y no un paso de relleno.
 */
export const TRACE_STEPS = [
  {
    key: 'captado',
    label: 'Lead captado',
    owner: 'marketing',
    what: 'Entró al CRM por un anuncio, el evaluador, WhatsApp o carga manual.'
  },
  {
    key: 'contactado',
    label: 'Alguien le respondió',
    owner: 'setter',
    what: 'Tiene primera respuesta registrada: un mensaje saliente o la primera nota de la ficha.'
  },
  {
    key: 'ventas',
    label: 'Pasó al Funnel de Ventas',
    owner: 'setter',
    what: 'Quedó sellado como lead comercial (`sales_funnel_at`).'
  },
  {
    key: 'cita',
    label: 'Cita agendada',
    owner: 'setter',
    what: 'Tiene una reunión en la agenda, o su etapa afirma que la cita existe.'
  },
  {
    key: 'propuesta',
    label: 'Propuesta sobre la mesa',
    owner: 'ventas',
    what: 'Se le emitió cotización o contrato, o está en negociación.'
  },
  {
    key: 'cerrado',
    label: 'Venta cerrada',
    owner: 'ventas',
    what: 'Etapa ganadora o proyecto abierto, sin marcar como no concretada.'
  },
  {
    key: 'cobrado',
    label: 'Pago verificado',
    owner: 'finanzas',
    what: 'Finanzas dio el visto bueno a por lo menos una cuota.'
  }
];

export const TRACE_STEP_KEYS = TRACE_STEPS.map((s) => s.key);
const LAST = TRACE_STEPS.length - 1;

/**
 * Qué pasos alcanzó un lead. Los predicados llegan de afuera para que este
 * módulo no tenga que saber qué status significa cada cosa.
 *
 * La cita se da por alcanzada con la reunión en la agenda **o** con la etapa
 * que la afirma: son dos cosas distintas y las dos cuentan. Un lead en
 * `cita_agendada` sin reunión es una cita que nadie puede ir a buscar —el
 * movimiento no se frena, ver `updateLeadStatus()`—, y exigir la reunión
 * mostraría como fuga a leads que el propio tablero cuenta como citas. La
 * diferencia se publica como anotación.
 */
export function reachedSteps(lead, ctx) {
  return {
    captado: true,
    contactado: Boolean(lead.first_response_at),
    ventas: ctx.graduated(lead),
    cita: ctx.meetingIds.has(lead.id) || ctx.appointment(lead),
    propuesta: ctx.proposalIds.has(lead.id) || ctx.quoting(lead),
    cerrado: ctx.wonIds.has(lead.id),
    cobrado: ctx.collectedIds.has(lead.id)
  };
}

/** El paso más lejano alcanzado. Máximo y no "el primero que falla". */
export function furthestIndex(reached) {
  let furthest = 0;
  TRACE_STEPS.forEach((step, i) => {
    if (reached[step.key]) furthest = i;
  });
  return furthest;
}

/** Quién tiene la pelota de un lead parado en el paso `index`. */
export function waitingOn(index) {
  const next = TRACE_STEPS[index + 1];
  return next ? next.owner : null;
}

const median = (values) => {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  const value = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  return Math.round(value * 10) / 10;
};

const ratio = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : null);

/**
 * La cadena completa a partir de los leads ya clasificados.
 *
 * Cada entrada es `{ reached, lost, idleDays }`: `idleDays` son los días sin un
 * solo movimiento registrado, que es lo que separa un lead parado porque se lo
 * está trabajando de uno que nadie mira. Se publica como **mediana** y no como
 * umbral: un "lleva 16 días" no necesita que nadie acuerde a partir de cuántos
 * días un lead está abandonado, y un promedio lo correría el único lead de hace
 * ocho meses.
 */
export function buildTrace(entries) {
  const total = entries.length;
  const acc = TRACE_STEPS.map(() => ({ reached: 0, stuckOpen: 0, lost: 0, idle: [] }));
  let completed = 0;

  for (const entry of entries) {
    const furthest = furthestIndex(entry.reached);
    for (let i = 0; i <= furthest; i++) acc[i].reached += 1;
    if (entry.lost) {
      acc[furthest].lost += 1;
    } else if (furthest === LAST) {
      completed += 1;
    } else {
      acc[furthest].stuckOpen += 1;
      if (Number.isFinite(entry.idleDays)) acc[furthest].idle.push(entry.idleDays);
    }
  }

  const steps = TRACE_STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    what: step.what,
    owner: step.owner,
    ownerLabel: TRACE_OWNERS[step.owner].label,
    waitingOn: waitingOn(i),
    waitingOnLabel: waitingOn(i) ? TRACE_OWNERS[waitingOn(i)].label : null,
    reached: acc[i].reached,
    ofTotal: ratio(acc[i].reached, total),
    ofPrevious: i === 0 ? null : ratio(acc[i].reached, acc[i - 1].reached),
    advanced: i === LAST ? null : acc[i + 1].reached,
    stuckOpen: acc[i].stuckOpen,
    lost: acc[i].lost,
    idleDaysMedian: median(acc[i].idle)
  }));

  /*
   * La mayor fuga: el paso donde más leads se detuvieron, parados o perdidos.
   * Es lo primero que se mira, así que se calcula acá y no en la pantalla: con
   * el cálculo repartido, el resaltado y la frase que lo explica podrían
   * terminar señalando pasos distintos.
   */
  let leak = null;
  for (const step of steps) {
    const stopped = step.stuckOpen + step.lost;
    if (!stopped) continue;
    if (!leak || stopped > leak.stopped) {
      leak = {
        key: step.key,
        label: step.label,
        nextLabel: TRACE_STEPS[TRACE_STEP_KEYS.indexOf(step.key) + 1]?.label || null,
        waitingOnLabel: step.waitingOnLabel,
        stopped,
        stuckOpen: step.stuckOpen,
        lost: step.lost,
        share: ratio(stopped, total)
      };
    }
  }

  return { total, completed, steps, leak };
}

/**
 * Las cuatro columnas con las que se compara una fuente de marketing contra
 * otra. Son excluyentes y su suma es el total de leads de esa fuente: sin esa
 * propiedad, una barra de composición no se puede leer como un reparto.
 *
 * `setter` incluye al lead que nadie contestó nunca —es el caso extremo del
 * mismo pendiente— y ese subconjunto viaja aparte (`neverAnswered`) para que la
 * pantalla lo diga sin partir la barra en cinco: con cinco segmentos no hay
 * forma de pintar la columna sin que dos colores queden indistinguibles con
 * daltonismo (ver la paleta de la vista).
 *
 * `neverAnswered` se pregunta por el paso más lejano y NO por la marca de
 * primera respuesta, aunque la marca sea el dato que la sostiene: con la marca
 * cruda, un lead ganado al que nadie le registró la respuesta saldría acá como
 * "sin contestar" mientras la cadena —que es acumulativa— lo cuenta como
 * contactado, y las dos cifras de la misma tarjeta se contradirían.
 */
export const TRACE_ZONES = [
  { key: 'ganado', label: 'Venta cerrada' },
  { key: 'ventas', label: 'Pendiente de Ventas' },
  { key: 'setter', label: 'Pendiente del Setter' },
  { key: 'perdido', label: 'Perdido o descartado' }
];

export const TRACE_ZONE_KEYS = TRACE_ZONES.map((z) => z.key);

/**
 * En qué columna cae un lead. El pendiente se decide por **quién tiene la
 * pelota** (el dueño del paso que falta) y no por el paso alcanzado, por la
 * razón de la cabecera.
 */
export function zoneOf({ reached, lost }) {
  const furthest = furthestIndex(reached);
  if (reached.cerrado || reached.cobrado) return 'ganado';
  if (lost) return 'perdido';
  return waitingOn(furthest) === 'setter' ? 'setter' : 'ventas';
}

/**
 * Agrupa los leads por fuente y devuelve una fila por fuente con su reparto.
 *
 * `keyOf` y `labelOf` llegan de afuera: de dónde salió un lead se contesta en
 * un solo sitio (`leadOrigin()`), y resolverlo acá sería una segunda versión de
 * esas reglas.
 */
export function groupByOrigin(entries, { keyOf, labelOf }) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: labelOf(entry),
        leads: 0,
        neverAnswered: 0,
        zones: Object.fromEntries(TRACE_ZONE_KEYS.map((z) => [z, 0]))
      };
      groups.set(key, group);
    }
    group.leads += 1;
    const zone = zoneOf(entry);
    if (zone === 'setter' && furthestIndex(entry.reached) === 0) group.neverAnswered += 1;
    group.zones[zone] += 1;
  }
  return [...groups.values()]
    .map((group) => ({ ...group, wonShare: ratio(group.zones.ganado, group.leads) }))
    .sort((a, b) => b.leads - a.leads);
}
