/**
 * Agrega `nudge_count` a `whatsapp_bot_sessions`: cuántos recordatorios de
 * inactividad ("¿Sigues por ahí?") se le mandaron al contacto en TODA la
 * conversación.
 *
 * `nudge_sent_at` no sirve para esto porque se borra apenas el contacto
 * vuelve a escribir (clearNudge), así que un lead que contesta cualquier cosa
 * cada hora reiniciaba el ciclo indefinidamente y recibía el mismo
 * recordatorio una y otra vez. Este contador NO se reinicia al responder: es
 * lo que permite variar el texto del segundo recordatorio y, sobre todo,
 * dejar de insistir tras el máximo y pasar el lead a "Congelado" para que lo
 * retome una persona.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.integer('nudge_count').notNullable().defaultTo(0);
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.dropColumn('nudge_count');
  });
}
