/**
 * Sigue habiendo dos problemas reportados en pruebas reales tras el ajuste
 * anterior del saludo (ver 20260914000000, 20260915000000):
 *
 *   1. Cuando el primer mensaje de la conversación es un pedido GENÉRICO de
 *      información ("info", "sobre tesis"), el bot seguía citando un hecho
 *      del servicio en vez de saludar y preguntar el tema. La instrucción
 *      estructural del prompt (ollamaService.js) ya se corrigió para
 *      exceptuar este caso, pero la regla EDITABLE del equipo (guardada en
 *      whatsapp_bot_settings.prompt_rules) decía lo mismo sin la excepción y
 *      seguía empujando al modelo hacia el hecho del catálogo. Se le agrega
 *      la misma excepción.
 *   2. El hecho "Te acompañamos/acompañaremos con un asesor durante toda tu
 *      tesis" pasa a "Te ayudaremos...", y se agrega una regla general de
 *      tiempo verbal: todo lo que la persona no tiene confirmado todavía va
 *      SIEMPRE en futuro, nunca en presente.
 *
 * Se reemplaza texto por texto exacto y se agrega solo si falta, así que si
 * el equipo ya editó estos textos desde el panel, esta migración los respeta.
 */

const RULE_REWRITES = [
  [
    'Si te piden "información" en general o una cotización, explícales primero en una frase en qué consiste el servicio con los datos reales, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta.',
    'Si te piden "información" en general o una cotización, explícales primero en una frase en qué consiste el servicio con los datos reales, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta. EXCEPCIÓN: si ese pedido genérico de información es el PRIMER mensaje de la conversación, esta regla no aplica — ahí sigue el formato del primer mensaje (saludo + pregunta por el tema, sin citar datos del servicio todavía).'
  ]
];

const NEW_RULES = [
  'SIEMPRE EN FUTURO lo que la persona todavía no tiene confirmado ("te ayudaremos", "te acompañaremos"), nunca en presente ("te ayudamos", "te acompañamos"): recién se confirma cuando agenda la reunión.'
];

const FACT_REWRITES = [
  [
    'Te acompañamos con un asesor durante toda tu tesis.',
    'Te ayudaremos con un asesor durante toda tu tesis.'
  ],
  [
    'Te acompañaremos con un asesor durante toda tu tesis.',
    'Te ayudaremos con un asesor durante toda tu tesis.'
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

function mergeMissing(list, additions) {
  const missing = additions.filter((item) => !list.includes(item));
  return missing.length ? [...list, ...missing] : null;
}

export async function up(knex) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules', 'faq_knowledge');

  for (const row of rows) {
    const patch = {};

    const { list: rewrittenRules, changed: rulesChanged } = rewriteList(row.prompt_rules, RULE_REWRITES);
    const baseRules = rulesChanged ? rewrittenRules : toList(row.prompt_rules);
    const mergedRules = baseRules.length ? mergeMissing(baseRules, NEW_RULES) : null;
    if (rulesChanged || mergedRules) patch.prompt_rules = JSON.stringify(mergedRules || baseRules);

    const { list: rewrittenFacts, changed: factsChanged } = rewriteList(row.faq_knowledge, FACT_REWRITES);
    if (factsChanged) patch.faq_knowledge = JSON.stringify(rewrittenFacts);

    if (Object.keys(patch).length) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
    }
  }
}

export async function down(knex) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules', 'faq_knowledge');

  for (const row of rows) {
    const patch = {};

    const { list: rewrittenRules, changed: rulesChanged } = rewriteList(
      row.prompt_rules,
      RULE_REWRITES.map(([from, to]) => [to, from])
    );
    const withoutNewRules = (rewrittenRules || toList(row.prompt_rules)).filter((r) => !NEW_RULES.includes(r));
    if (rulesChanged || withoutNewRules.length !== toList(row.prompt_rules).length) {
      patch.prompt_rules = JSON.stringify(withoutNewRules);
    }

    const { list: rewrittenFacts, changed: factsChanged } = rewriteList(
      row.faq_knowledge,
      FACT_REWRITES.map(([from, to]) => [to, from])
    );
    if (factsChanged) patch.faq_knowledge = JSON.stringify(rewrittenFacts);

    if (Object.keys(patch).length) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
    }
  }
}
