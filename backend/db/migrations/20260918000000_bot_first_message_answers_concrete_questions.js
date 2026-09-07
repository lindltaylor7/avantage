/**
 * La excepción del primer mensaje (ver 20260916000000) estaba tragándose
 * preguntas concretas, no solo los pedidos genéricos de información para los
 * que se escribió.
 *
 * Caso real: el contacto abre con "hola, cuánto está la tesis desde cero?" y
 * el bot responde solo "¿Sobre qué tema te gustaría hacer tu tesis?". La
 * pregunta del precio no se contesta nunca — y dos mensajes después se le
 * ofrece un "10% de descuento sobre el precio final" de un precio que nadie
 * le dijo.
 *
 * Se acota la excepción a los pedidos GENÉRICOS y se dice explícitamente que
 * una pregunta concreta (costo, duración, si trabajan su carrera) se responde
 * igual dentro del primer mensaje. `whatsappBotService.js` además lleva la
 * cuenta de la pregunta de precio que quedó sin responder y la salda al
 * proponer la reunión, por si el modelo igual la deja pasar.
 *
 * Se reemplaza texto por texto exacto, así que si el equipo ya editó esta
 * regla desde el panel, la migración la respeta.
 */

const RULE_REWRITES = [
  [
    'Si te piden "información" en general o una cotización, explícales primero en una frase en qué consiste el servicio con los datos reales, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta. EXCEPCIÓN: si ese pedido genérico de información es el PRIMER mensaje de la conversación, esta regla no aplica — ahí sigue el formato del primer mensaje (saludo + pregunta por el tema, sin citar datos del servicio todavía).',
    'Si te piden "información" en general o una cotización, explícales primero en una frase en qué consiste el servicio con los datos reales, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta. EXCEPCIÓN: si ese pedido es GENÉRICO ("info", "quiero información", "sobre tesis") y además es el PRIMER mensaje de la conversación, esta regla no aplica — ahí sigue el formato del primer mensaje (saludo + pregunta por el tema, sin citar datos del servicio todavía). La excepción NO cubre una PREGUNTA CONCRETA (cuánto cuesta, cuánto dura, si trabajan su carrera): esas se responden siempre con los datos reales, dentro del mismo primer mensaje, después del saludo y antes de tu pregunta por el tema.'
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

function rewriteList(value, pairs) {
  const list = toList(value);
  if (list.length === 0) return { list: null, changed: false };

  let changed = false;
  const updated = list.map((item) => {
    const match = pairs.find(([from]) => from === item);
    if (!match) return item;
    changed = true;
    return match[1];
  });
  return { list: updated, changed };
}

async function applyRewrites(knex, pairs) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules');

  for (const row of rows) {
    const { list, changed } = rewriteList(row.prompt_rules, pairs);
    if (!changed) continue;
    await knex('whatsapp_bot_settings').where({ id: row.id }).update({ prompt_rules: JSON.stringify(list) });
  }
}

export async function up(knex) {
  await applyRewrites(knex, RULE_REWRITES);
}

export async function down(knex) {
  await applyRewrites(knex, RULE_REWRITES.map(([from, to]) => [to, from]));
}
