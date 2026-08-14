/**
 * Crea la tabla `roles`. Cada usuario interno pertenece a un rol, y cada rol
 * agrupa un conjunto de permisos (herramientas habilitadas).
 */
export function up(knex) {
  return knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('name', 80).notNullable().unique();
    table.string('description', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('roles');
}
