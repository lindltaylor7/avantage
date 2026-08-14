/**
 * Tabla pivote N:N entre `projects` y `users`: colaboradores asignados a un proyecto.
 */
export function up(knex) {
  return knex.schema.createTable('project_collaborators', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['project_id', 'user_id']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('project_collaborators');
}
