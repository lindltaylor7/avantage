/**
 * Ajustes pedidos tras revisar una conversación real más:
 *
 *   1. Avan ya no se presenta ni nombra a la empresa al abrir la conversación
 *      (la instrucción estructural vive en el código; aquí se limpian los
 *      textos configurables que todavía la daban por hecha).
 *   2. La intención de agendar deja de ser "reúne lo mínimo y cierra" para
 *      pasar a "deja de preguntar y agenda": alguien que ya propuso día y hora
 *      no debería seguir respondiendo preguntas de tema, carrera y universidad.
 *   3. El hecho del FAQ que describe el servicio ya no empieza nombrando a la
 *      empresa, porque el modelo lo copiaba tal cual como primer mensaje.
 *
 * Se reemplaza texto por texto exacto: si el equipo ya reescribió alguno desde
 * el panel, esta migración lo respeta y no lo toca.
 */

const RULE_REWRITES = [
  [
    'INTENCIÓN DE AGENDAR: si en cualquier momento el contacto pide agendar, tener una llamada/reunión, hablar con alguien del equipo, pregunta cuánto cuesta, o pregunta por horarios/fechas, esto gana sobre seguir profundizando en el tema. Reúne solo lo mínimo obligatorio y marca "ready": true apenas lo tengas.',
    'INTENCIÓN DE AGENDAR: si el contacto pide agendar, tener una llamada/reunión, hablar con alguien del equipo, o propone un día u hora, eso gana sobre cualquier dato que te falte: marca "schedulingIntent": true de inmediato y deja de preguntar. El sistema pasa a agendar solo.'
  ],
  [
    'SALUDA UNA SOLA VEZ: solo el primer mensaje de la conversación lleva saludo y presentación. Del segundo mensaje en adelante NUNCA empieces con "Hola", "¡Hola!" ni "Buenas" — sigue la conversación como quien ya está hablando con la persona.',
    'SALUDA UNA SOLA VEZ: solo el primer mensaje de la conversación lleva saludo. Del segundo mensaje en adelante NUNCA empieces con "Hola", "¡Hola!" ni "Buenas" — sigue la conversación como quien ya está hablando con la persona.'
  ],
  [
    'Si te piden "información" en general o una cotización, explícales primero en una frase qué hacen en Avantage con los datos reales del servicio, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta.',
    'Si te piden "información" en general o una cotización, explícales primero en una frase en qué consiste el servicio con los datos reales, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta.'
  ]
];

const FACT_REWRITES = [
  [
    'En Avantage Group te asignamos un asesor que te guía en todo el proceso de tu tesis.',
    'Te asignamos un asesor que te guía en todo el proceso de tu tesis.'
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

async function apply(knex, rulePairs, factPairs) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules', 'faq_knowledge');

  for (const row of rows) {
    const patch = {};
    const rules = rewriteList(row.prompt_rules, rulePairs);
    if (rules) patch.prompt_rules = rules;
    const facts = rewriteList(row.faq_knowledge, factPairs);
    if (facts) patch.faq_knowledge = facts;
    if (Object.keys(patch).length) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
    }
  }
}

const flip = (pairs) => pairs.map(([from, to]) => [to, from]);

export async function up(knex) {
  await apply(knex, RULE_REWRITES, FACT_REWRITES);
}

export async function down(knex) {
  await apply(knex, flip(RULE_REWRITES), flip(FACT_REWRITES));
}
