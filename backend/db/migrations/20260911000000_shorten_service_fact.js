/**
 * Acorta el hecho que describe el servicio.
 *
 * El modelo lo parafrasea casi literal, así que era el que estiraba el primer
 * mensaje: "Te asignamos un asesor que te guía en todo el proceso de tu tesis"
 * son 14 palabras que el bot repetía enteras antes de poder preguntar nada.
 * El contenido es el mismo, solo cambia la redacción.
 *
 * Reemplazo por texto exacto: si el equipo ya lo reescribió desde el panel,
 * esta migración lo respeta y no lo toca.
 */

const REWRITES = [
  [
    'Te asignamos un asesor que te guía en todo el proceso de tu tesis.',
    'Te acompañamos con un asesor durante toda tu tesis.'
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

async function apply(knex, pairs) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'faq_knowledge');

  for (const row of rows) {
    const facts = toList(row.faq_knowledge);
    if (facts.length === 0) continue;

    let changed = false;
    const updated = facts.map((fact) => {
      const match = pairs.find(([from]) => from === fact);
      if (!match) return fact;
      changed = true;
      return match[1];
    });

    if (changed) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update({ faq_knowledge: JSON.stringify(updated) });
    }
  }
}

export async function up(knex) {
  await apply(knex, REWRITES);
}

export async function down(knex) {
  await apply(knex, REWRITES.map(([from, to]) => [to, from]));
}
