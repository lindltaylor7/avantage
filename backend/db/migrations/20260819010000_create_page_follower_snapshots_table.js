/**
 * Crea la tabla `page_follower_snapshots`: guarda el conteo de seguidores de
 * las páginas de Facebook conectadas en cada sondeo periódico a la Graph API
 * (Meta no notifica los follows/unfollows en tiempo real vía webhook).
 */
export function up(knex) {
  return knex.schema.createTable('page_follower_snapshots', (table) => {
    table.increments('id').primary();
    table.string('page_id', 50).notNullable();
    table.string('page_name', 150).nullable();
    table.integer('fan_count').unsigned().nullable();
    table.integer('followers_count').unsigned().nullable();
    table.timestamp('captured_at').defaultTo(knex.fn.now());

    table.index('page_id');
    table.index('captured_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('page_follower_snapshots');
}
