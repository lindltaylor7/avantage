import { isSalesLostStatus, isSetterDiscardStatus } from './salesFunnelStage.js';

/**
 * En qué PASO se perdió un lead, que es otra pregunta que POR QUÉ se perdió.
 *
 * El reporte de Campañas tenía un solo contador de pérdida ("Leads
 * descartados" / "Perdidos") que sumaba las dos cosas: los 713 leads en la
 * etapa «No Califica / Sin Resp.» del Setter Funnel y los 199 en «Perdido» del
 * Funnel de Ventas (corte del 26/11/2026). Mezclados no se puede decir si el
 * anuncio trae contactos que nunca llegaron a ser una oportunidad o clientes
 * reales que no compraron, y a uno se le corta el presupuesto y al otro se le
 * revisa el cierre.
 *
 * Son TRES cajones **excluyentes** y su suma es siempre el total de leads
 * perdidos (`LOST_STATUSES`). Esa es una propiedad y no un detalle: es lo
 * único que permite afirmar que el desglose cuadra con el contador que ya
 * estaba publicado, y lo que deja agregar las tres columnas sin cambiar
 * ninguna cifra histórica.
 *
 *  - `perdido_ventas`: la etapa «Perdido» del Funnel de Ventas. Era un cliente
 *    real, llegó al closer y no compró.
 *  - `descartado_sin_respuesta`: se descartó en el Setter Funnel y NADIE le
 *    contestó nunca (`leads.first_response_at` vacío). Lo que hay que mirar
 *    acá es si el problema fue el contacto o que no se lo atendió — por eso se
 *    pregunta por la marca de primera respuesta y no por la conversación de
 *    WhatsApp: el lead de formulario que nunca escribió no tiene conversación,
 *    y con ese criterio todos salían "sin respuesta" (ver `leadFirstResponse`).
 *  - `descartado_tras_contacto`: se descartó en el Setter Funnel y sí se le
 *    había contestado. Alguien lo trabajó y decidió que no servía.
 *
 * Lo que este módulo **no** contesta es el motivo ("solo curioso", "pide
 * gratis", "número equivocado"). Ese dato no existe todavía en ninguna
 * columna, así que no se puede derivar sin inventarlo: `descartado_tras
 * contacto` dice que una persona lo revisó y lo descartó, no por qué. El
 * motivo llega cuando se agregue el campo al mover la tarjeta, y entonces
 * estos tres cajones siguen valiendo —son el PASO— y el motivo se cuenta
 * aparte dentro de cada uno.
 */

/** Los tres cajones, en el orden en que se publican. */
export const LOSS_STAGES = ['descartado_sin_respuesta', 'descartado_tras_contacto', 'perdido_ventas'];

export const LOSS_STAGE_LABELS = {
  descartado_sin_respuesta: 'Descartado sin respuesta',
  descartado_tras_contacto: 'Descartado tras contacto',
  perdido_ventas: 'Perdido en ventas'
};

/**
 * El cajón de un lead perdido, o `null` si el lead no está perdido.
 *
 * `responded` es la marca de primera respuesta del lead, ya resuelta por quien
 * llama (el reporte la calcula una vez para todas sus cifras). Se recibe y no
 * se deduce acá para que este módulo siga siendo puro y para no tener dos
 * definiciones de "se le contestó".
 */
export function lossStage({ status, responded = false } = {}) {
  if (isSalesLostStatus(status)) return 'perdido_ventas';
  if (isSetterDiscardStatus(status)) {
    return responded ? 'descartado_tras_contacto' : 'descartado_sin_respuesta';
  }
  return null;
}

/**
 * Cuenta los tres cajones de una lista de cajones ya resueltos.
 *
 * Devuelve siempre las tres claves. Lo que no está perdido no se cuenta en
 * ninguna, así que la suma de las tres es el total de perdidos y no el total
 * de leads.
 */
export function tallyLossStages(stages) {
  const out = {
    descartado_sin_respuesta: 0,
    descartado_tras_contacto: 0,
    perdido_ventas: 0
  };
  for (const stage of stages) {
    if (stage && stage in out) out[stage] += 1;
  }
  return out;
}
