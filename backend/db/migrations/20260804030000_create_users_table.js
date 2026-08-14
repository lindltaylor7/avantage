/**
 * Crea la tabla `users`: usuarios internos con acceso a las herramientas
 * protegidas (Panel de Leads, Proyectos, Roles y Permisos), según su rol.
 */
export function up(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 150).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.integer('role_id').unsigned().notNullable()
      .references('id').inTable('roles').onDelete('RESTRICT');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('users');
}
