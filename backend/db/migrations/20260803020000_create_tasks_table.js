/**
 * Crea la tabla `tasks`: tareas asociadas a un proyecto. El porcentaje de
 * avance del proyecto se calcula como (tareas completadas / total de tareas).
 */
export function up(knex) {
  return knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.string('title', 300).notNullable();
    table.string('status', 30).notNullable().defaultTo('pendiente'); // pendiente | en_progreso | completado
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('project_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('tasks');
}
