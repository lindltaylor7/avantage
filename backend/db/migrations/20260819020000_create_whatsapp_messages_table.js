/**
 * Crea la tabla `whatsapp_messages`: mensajes entrantes recibidos vía el
 * webhook de WhatsApp Business Platform (campo "messages").
 */
export function up(knex) {
  return knex.schema.createTable('whatsapp_messages', (table) => {
    table.increments('id').primary();
    table.string('wa_id', 30).notNullable();
    table.string('contact_name', 150).nullable();
    table.string('message_id', 100).notNullable().unique();
    table.string('message_type', 30).notNullable();
    table.text('body').nullable();
    table.json('raw_payload').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());

    table.index('wa_id');
    table.index('received_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('whatsapp_messages');
}
