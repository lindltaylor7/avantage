/**
 * Agrega a `whatsapp_bot_settings` la "base de conocimiento" de Avan: los
 * datos reales del servicio que puede afirmar cuando el contacto pregunta
 * algo (cuánto dura la reunión, qué incluye, cómo se cobra...).
 *
 *   - meeting_duration_minutes: duración de la reunión con el jefe comercial
 *     que Avan le comunica al contacto (10 por defecto). Es SOLO la respuesta
 *     que da por chat; el bloque que se reserva en el Google Calendar del
 *     asesor sigue siendo el de `advisor_availability`.
 *   - faq_knowledge: lista (JSON de strings) de hechos verificados que el
 *     panel deja agregar / editar / quitar. Se inyectan en el prompt como
 *     lo ÚNICO que Avan tiene permitido afirmar; cualquier otra pregunta la
 *     deriva al jefe comercial en vez de inventar.
 *
 * Sin esto, una pregunta como "¿cuánto dura el Meet?" no tenía respuesta
 * posible: el bot la ignoraba o la trataba como un dato inválido del paso de
 * agendamiento en el que estuviera.
 */

// Copia congelada de los valores por defecto al momento de esta migración
// (los de runtime viven en whatsappBotPromptDefaults.js; una migración no
// debe depender de código de la app que puede cambiar después).
const SEED_MEETING_DURATION_MINUTES = 10;
const SEED_FAQ = [
  'La reunión es una llamada corta con el jefe comercial para revisar tu caso y explicarte cómo trabajamos, sin compromiso.',
  'Puede ser telefónica o por Google Meet; eligiendo Google Meet se aplica un descuento sobre el precio final.',
  'Los costos y las formas de pago los detalla el jefe comercial en la reunión: dependen de tu carrera, tu nivel académico y el alcance de la tesis.',
  'Acompañamos tesis desde cero (sin tema definido) y también tesis ya empezadas u observadas.',
  'Trabajamos con todas las carreras, tanto en pregrado como en posgrado (maestría y doctorado).',
  'No necesitas llevar nada preparado a la reunión.'
];

export async function up(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.integer('meeting_duration_minutes').notNullable().defaultTo(SEED_MEETING_DURATION_MINUTES);
    table.text('faq_knowledge').nullable();
  });

  await knex('whatsapp_bot_settings').update({
    meeting_duration_minutes: SEED_MEETING_DURATION_MINUTES,
    faq_knowledge: JSON.stringify(SEED_FAQ)
  });
}

export async function down(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('meeting_duration_minutes');
    table.dropColumn('faq_knowledge');
  });
}
