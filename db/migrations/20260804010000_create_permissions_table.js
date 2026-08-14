/**
 * Crea la tabla `permissions`. Cada fila representa una "herramienta" interna
 * (existente o por desarrollarse) que puede habilitarse por rol, p. ej.
 * "leads.view", "projects.view", "roles.manage".
 */
export function up(knex) {
  return knex.schema.createTable('permissions', (table) => {
    table.increments('id').primary();
    table.string('key', 80).notNullable().unique();
    table.string('label', 150).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('permissions');
}
