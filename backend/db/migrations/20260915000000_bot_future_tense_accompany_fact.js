/**
 * "Te acompañamos con un asesor durante toda tu tesis" pasa a futuro ("Te
 * acompañaremos..."), igual que ya se hizo con el hecho de "sin tema": en el
 * primer contacto todavía no se acordó nada, así que el presente suena a una
 * ayuda que ya se dio.
 *
 * También evita que el modelo la use tal cual como línea de apertura: el
 * prompt (ollamaService.js) ya deja claro que el PRIMER mensaje no cita
 * hechos del servicio salvo que pregunten algo puntual — este hecho queda
 * disponible para esa situación, con el tiempo verbal correcto.
 *
 * Se reemplaza texto por texto exacto: si el equipo ya reescribió el hecho
 * desde el panel, esta migración lo respeta y no lo toca.
 */

const REWRITES = [
  [
    'Te acompañamos con un asesor durante toda tu tesis.',
    'Te acompañaremos con un asesor durante toda tu tesis.'
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
