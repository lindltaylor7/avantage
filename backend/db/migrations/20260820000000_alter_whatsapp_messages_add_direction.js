/**
 * Agrega `direction` (inbound/outbound) y `status` (sent/delivered/read/failed)
 * a `whatsapp_messages`, necesarios para poder responder mensajes desde el CRM
 * y reflejar las actualizaciones de estado que envía el webhook.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.string('direction', 10).notNullable().defaultTo('inbound');
    table.string('status', 20).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.dropColumn('direction');
    table.dropColumn('status');
  });
}
