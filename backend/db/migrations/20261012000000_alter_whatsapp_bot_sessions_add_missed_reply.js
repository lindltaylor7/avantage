/**
 * Agrega `missed_reply_at` a `whatsapp_bot_sessions`: marca cuándo el barrido
 * detectó que el ÚLTIMO mensaje de la conversación era del contacto y el bot
 * nunca le respondió (un turno perdido por una caída del LLM, un envío
 * fallido o un webhook que no llegó a procesarse).
 *
 * Sirve para dos cosas, con la misma lógica de reserva que `nudge_sent_at`:
 * que dos barridos solapados no reintenten el mismo turno dos veces, y que
 * un contacto al que ya se le reintentó una vez —y sigue sin respuesta— pase
 * a un asesor en vez de entrar en un ciclo de reintentos automáticos.
 *
 * Caso real: un lead contestó "Soy de administracion", el bot no respondió
 * nada, y una hora después recibió el recordatorio de inactividad "¿Sigues
 * por ahí?" — reclamándole a él un silencio que era del bot.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.timestamp('missed_reply_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.dropColumn('missed_reply_at');
  });
}
