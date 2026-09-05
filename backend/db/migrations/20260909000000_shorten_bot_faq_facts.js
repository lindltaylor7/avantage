/**
 * Acorta los hechos de la base de conocimiento que describen el servicio.
 *
 * El modelo los parafrasea casi literalmente, así que un hecho largo produce
 * un mensaje largo: el primer mensaje del bot salía de 33 palabras, y por
 * WhatsApp en Perú eso ya es un párrafo que la gente no lee. El contenido es
 * el mismo, solo cambia la redacción.
 *
 * Se reemplaza texto por texto exacto, así que si el equipo ya reescribió
 * alguno desde el panel, esta migración lo respeta y no lo toca.
 */

const REWRITES = [
  [
    'Avantage Group acompaña a estudiantes en Perú en el desarrollo de su tesis, con un asesor que los guía durante el proceso.',
    'En Avantage Group te asignamos un asesor que te guía en todo el proceso de tu tesis.'
  ],
  [
    'Si aún no tienes un tema, no es problema: parte del acompañamiento es ayudarte a definir uno viable para tu carrera.',
    'Si no tienes tema, te ayudamos a definir uno viable para tu carrera.'
  ],
  [
    'El jefe comercial te explica en la reunión el alcance exacto del acompañamiento y las modalidades disponibles.',
    'El jefe comercial te explica el alcance y las modalidades en la reunión.'
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

async function applyRewrites(knex, pairs) {
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
  await applyRewrites(knex, REWRITES);
}

export async function down(knex) {
  await applyRewrites(knex, REWRITES.map(([from, to]) => [to, from]));
}
