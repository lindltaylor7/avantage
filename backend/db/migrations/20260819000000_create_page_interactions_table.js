/**
 * Crea la tabla `page_interactions`: registra las interacciones (comentarios,
 * reacciones/likes, publicaciones, compartidos) recibidas vía el webhook de
 * Meta (campo "feed") sobre las páginas de Facebook conectadas.
 */
export function up(knex) {
  return knex.schema.createTable('page_interactions', (table) => {
    table.increments('id').primary();
    table.string('page_id', 50).notNullable();
    table.string('item_type', 30).notNullable();
    table.string('verb', 20).nullable();
    table.string('post_id', 100).nullable();
    table.string('comment_id', 100).nullable();
    table.string('sender_id', 50).nullable();
    table.string('sender_name', 150).nullable();
    table.text('message').nullable();
    table.string('reaction_type', 30).nullable();
    table.json('raw_value').nullable();
    table.timestamp('event_time').nullable();
    table.timestamp('received_at').defaultTo(knex.fn.now());

    table.index('page_id');
    table.index('item_type');
    table.index('received_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('page_interactions');
}
