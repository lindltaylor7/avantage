/**
 * Crea la tabla `page_messages`: mensajes directos (Messenger) recibidos en
 * la bandeja de entrada de la Página, vía el campo "messaging" del webhook
 * de Meta (formato distinto al de comentarios/reacciones del campo "feed").
 */
export function up(knex) {
  return knex.schema.createTable('page_messages', (table) => {
    table.increments('id').primary();
    table.string('page_id', 50).notNullable();
    table.string('sender_id', 50).notNullable();
    table.string('sender_name', 150).nullable();
    table.string('message_id', 150).notNullable().unique();
    table.text('text').nullable();
    table.json('raw_payload').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());

    table.index('page_id');
    table.index('sender_id');
    table.index('received_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('page_messages');
}
