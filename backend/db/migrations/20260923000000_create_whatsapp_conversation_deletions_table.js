/**
 * Registro de auditoría de conversaciones de WhatsApp eliminadas desde el
 * panel: qué contacto se borró, cuántos mensajes tenía y qué usuario lo hizo.
 * Los mensajes en sí se eliminan de `whatsapp_messages`; esta tabla es lo
 * único que queda como rastro de la eliminación.
 */
export function up(knex) {
  return knex.schema.createTable('whatsapp_conversation_deletions', (table) => {
    table.increments('id').primary();
    table.string('wa_id', 30).notNullable();
    table.string('contact_name', 150).nullable();
    table.integer('message_count').notNullable().defaultTo(0);
    table.integer('deleted_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.string('deleted_by_name', 150).nullable();
    table.timestamp('deleted_at').defaultTo(knex.fn.now());

    table.index('wa_id');
    table.index('deleted_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('whatsapp_conversation_deletions');
}
