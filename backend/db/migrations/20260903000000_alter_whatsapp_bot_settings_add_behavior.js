/**
 * Agrega a `whatsapp_bot_settings` los controles de comportamiento de Avan que
 * el equipo pidió poder ajustar desde el panel:
 *   - short_replies_enabled: fuerza respuestas muy cortas en el chat.
 *   - typing_indicator_enabled: muestra el "escribiendo..." de WhatsApp antes
 *     de cada respuesta del bot.
 *   - message_gap_seconds: espera mínima estricta entre mensajes salientes del
 *     bot (anti-spam / calidad del número).
 */
export async function up(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.boolean('short_replies_enabled').notNullable().defaultTo(true);
    table.boolean('typing_indicator_enabled').notNullable().defaultTo(true);
    table.integer('message_gap_seconds').unsigned().notNullable().defaultTo(5);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('short_replies_enabled');
    table.dropColumn('typing_indicator_enabled');
    table.dropColumn('message_gap_seconds');
  });
}
