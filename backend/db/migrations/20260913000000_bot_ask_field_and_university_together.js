/**
 * La carrera y la universidad pasan a preguntarse en el MISMO mensaje. La
 * instrucción estructural vive en el código (ollamaService), pero la regla de
 * equipo guardada en `whatsapp_bot_settings` decía "UNA sola pregunta a la
 * vez" sin excepciones y contradecía el cambio, así que se le agrega la
 * excepción.
 *
 * Se reemplaza texto por texto exacto: si el equipo ya reescribió la regla
 * desde el panel, esta migración la respeta y no la toca.
 */

const RULE_REWRITES = [
  [
    'Haz UNA sola pregunta a la vez: la más relevante según lo que ya sabes y lo que la persona acaba de escribir. Sin listas ni viñetas. Nunca enumeres preguntas ni digas "Pregunta X de Y". Máximo 1 emoji.',
    'Haz UNA sola pregunta a la vez: la más relevante según lo que ya sabes y lo que la persona acaba de escribir. La única excepción es la carrera y la universidad, que van juntas en la misma frase. Sin listas ni viñetas. Nunca enumeres preguntas ni digas "Pregunta X de Y". Máximo 1 emoji.'
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

async function apply(knex, rulePairs) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules');

  for (const row of rows) {
    const rules = rewriteList(row.prompt_rules, rulePairs);
    if (rules) await knex('whatsapp_bot_settings').where({ id: row.id }).update({ prompt_rules: rules });
  }
}

const flip = (pairs) => pairs.map(([from, to]) => [to, from]);

export async function up(knex) {
  await apply(knex, RULE_REWRITES);
}

export async function down(knex) {
  await apply(knex, flip(RULE_REWRITES));
}
