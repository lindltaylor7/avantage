/**
 * Agrega `nudge_sent_at` a `whatsapp_bot_sessions`: marca cuándo se le mandó
 * al contacto el recordatorio de inactividad ("¿Estás ahí?"), para no
 * mandarlo dos veces y para saber cuándo escalar a "Congelado" en el Setter
 * Funnel si sigue sin responder.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.timestamp('nudge_sent_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.dropColumn('nudge_sent_at');
  });
}
