/**
 * Ajustes pedidos tras revisar más conversaciones reales:
 *
 *   1. Unifica el término con el que Avan se refiere a la persona con la que
 *      agenda la reunión: hasta ahora convivían "el jefe comercial" (textos
 *      de personalidad/FAQ) y "el asesor" (todo el flujo de agendamiento),
 *      como si fueran dos personas distintas. Se deja solo "el asesor".
 *   2. "te ayudamos a definir uno viable" pasa a futuro ("te ayudaremos"):
 *      en el primer mensaje de la conversación (antes de haber hecho nada
 *      todavía) el presente sonaba a una ayuda que ya se dio.
 *
 * Se reemplaza texto por texto exacto: si el equipo ya reescribió alguno de
 * estos textos desde el panel, esta migración lo respeta y no lo toca.
 */

const OBJECTIVE_REWRITE = [
  'A través de una conversación natural, cercana y breve (NUNCA un cuestionario ni un formulario), entender de qué trata el tema o problema de tesis de la persona y luego ofrecerle una reunión con el jefe comercial de Avantage Group para revisar su caso. ESE es el cierre que buscas, no generar un reporte ni anunciar un puntaje de viabilidad (eso ya no se le comunica al lead por chat).',
  'A través de una conversación natural, cercana y breve (NUNCA un cuestionario ni un formulario), entender de qué trata el tema o problema de tesis de la persona y luego ofrecerle una reunión con el asesor de Avantage Group para revisar su caso. ESE es el cierre que buscas, no generar un reporte ni anunciar un puntaje de viabilidad (eso ya no se le comunica al lead por chat).'
];

const RULE_REWRITES = [
  [
    'No prometas ni menciones un "reporte de viabilidad", "evaluación con IA" ni ningún puntaje: el valor que ofreces es la reunión con el jefe comercial, no un análisis automático.',
    'No prometas ni menciones un "reporte de viabilidad", "evaluación con IA" ni ningún puntaje: el valor que ofreces es la reunión con el asesor, no un análisis automático.'
  ],
  [
    'Si preguntan por precios/costos, no los inventes ni los evadas en seco: di que el jefe comercial se los detalla en la reunión, y usa eso para impulsar el agendamiento.',
    'Si preguntan por precios/costos, no los inventes ni los evadas en seco: di que el asesor se los detalla en la reunión, y usa eso para impulsar el agendamiento.'
  ]
];

const FACT_REWRITES = [
  [
    'Si no tienes tema, te ayudamos a definir uno viable para tu carrera.',
    'Si no tienes tema, te ayudaremos a definir uno viable para tu carrera.'
  ],
  [
    'El jefe comercial te explica el alcance y las modalidades en la reunión.',
    'El asesor te explica el alcance y las modalidades en la reunión.'
  ],
  [
    'La reunión es una llamada corta con el jefe comercial para revisar tu caso y explicarte cómo trabajamos, sin compromiso.',
    'La reunión es una llamada corta con el asesor para revisar tu caso y explicarte cómo trabajamos, sin compromiso.'
  ],
  [
    'Los costos y las formas de pago los detalla el jefe comercial en la reunión: dependen de tu carrera, tu nivel académico y el alcance de la tesis.',
    'Los costos y las formas de pago los detalla el asesor en la reunión: dependen de tu carrera, tu nivel académico y el alcance de la tesis.'
  ]
];

function toList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Reemplaza en la lista los elementos que coincidan exactamente. */
function rewriteList(value, pairs) {
  const list = toList(value);
  if (list.length === 0) return null;

  let changed = false;
  const updated = list.map((item) => {
    const match = pairs.find(([from]) => from === item);
    if (!match) return item;
    changed = true;
    return match[1];
  });
  return changed ? JSON.stringify(updated) : null;
}

async function apply(knex, objectivePair, rulePairs, factPairs) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'bot_objective', 'prompt_rules', 'faq_knowledge');

  for (const row of rows) {
    const patch = {};

    if (row.bot_objective === objectivePair[0]) patch.bot_objective = objectivePair[1];

    const rules = rewriteList(row.prompt_rules, rulePairs);
    if (rules) patch.prompt_rules = rules;

    const facts = rewriteList(row.faq_knowledge, factPairs);
    if (facts) patch.faq_knowledge = facts;

    if (Object.keys(patch).length) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
    }
  }
}

const flipPair = ([from, to]) => [to, from];
const flipList = (pairs) => pairs.map(flipPair);

export async function up(knex) {
  await apply(knex, OBJECTIVE_REWRITE, RULE_REWRITES, FACT_REWRITES);
}

export async function down(knex) {
  await apply(knex, flipPair(OBJECTIVE_REWRITE), flipList(RULE_REWRITES), flipList(FACT_REWRITES));
}
