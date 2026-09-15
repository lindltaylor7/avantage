/**
 * Agrega `sales_notification_phone` a `whatsapp_bot_settings`: el número de
 * WhatsApp del vendedor/asesor al que se le avisa cuando Avan transfiere una
 * conversación (ver `handOffToAdvisor` en whatsappBotService.js).
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.string('sales_notification_phone', 30).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('sales_notification_phone');
  });
}
