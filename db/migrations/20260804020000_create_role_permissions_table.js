/**
 * Tabla pivote N:N entre `roles` y `permissions`.
 */
export function up(knex) {
  return knex.schema.createTable('role_permissions', (table) => {
    table.increments('id').primary();
    table.integer('role_id').unsigned().notNullable()
      .references('id').inTable('roles').onDelete('CASCADE');
    table.integer('permission_id').unsigned().notNullable()
      .references('id').inTable('permissions').onDelete('CASCADE');
    table.unique(['role_id', 'permission_id']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('role_permissions');
}
