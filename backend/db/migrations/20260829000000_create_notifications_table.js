/**
 * Crea la tabla `notifications`: notificaciones internas del panel (campana
 * del navbar) — por ahora, principalmente cuando Avan agenda una reunión o
 * cuando un lead con reunión ya agendada necesita que un asesor intervenga
 * (reagendar, queja, consulta nueva).
 */
export function up(knex) {
  return knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.string('type', 40).notNullable();
    table.string('title', 255).notNullable();
    table.text('body').nullable();
    table.string('link', 255).nullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('is_read');
    table.index('created_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('notifications');
}
