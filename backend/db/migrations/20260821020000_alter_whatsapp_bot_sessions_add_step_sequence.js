/**
 * Agrega `step_sequence` a `whatsapp_bot_sessions`: guarda una "foto" del
 * orden de preguntas activas al iniciar la conversación, para que si el
 * equipo reordena/activa/desactiva preguntas mientras alguien ya está a
 * mitad del flujo, esa conversación no se rompa ni se desordene.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.json('step_sequence').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.dropColumn('step_sequence');
  });
}
