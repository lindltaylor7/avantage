/**
 * Agrega `status_error` a `whatsapp_messages`: guarda el motivo (código y
 * mensaje) cuando WhatsApp reporta que la entrega de un mensaje saliente falló.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.text('status_error').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.dropColumn('status_error');
  });
}
