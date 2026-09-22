/**
 * Plantillas de tareas reutilizables.
 *
 * Un proyecto de tesis arranca casi siempre con la misma lista de tareas, y
 * esa lista cambia según la universidad (cada una pide su propio esquema de
 * capítulos y sus propios entregables). Hasta ahora había que tipear las
 * tareas una por una en cada proyecto nuevo; con esto el equipo guarda el
 * conjunto una vez, lo busca por nombre o por universidad y lo importa.
 *
 * Las tareas importadas se COPIAN al proyecto (`tasks`): editar después la
 * plantilla no toca los proyectos que ya la usaron, porque el avance de un
 * proyecto no puede cambiar solo porque alguien reordenó una plantilla.
 */
export async function up(knex) {
  await knex.schema.createTable('task_templates', (table) => {
    table.increments('id').primary();
    table.string('name', 200).notNullable();
    // La universidad es opcional: una plantilla sin universidad es la genérica,
    // la que se sugiere cuando no hay ninguna específica para ese caso.
    table.string('university', 255).nullable();
    table.string('academic_level', 100).nullable();
    // Para ordenar las sugerencias por lo que el equipo realmente usa.
    table.integer('times_used').unsigned().notNullable().defaultTo(0);
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('university');
  });

  await knex.schema.createTable('task_template_items', (table) => {
    table.increments('id').primary();
    table.integer('template_id').unsigned().notNullable()
      .references('id').inTable('task_templates').onDelete('CASCADE');
    table.string('title', 300).notNullable();
    table.integer('position').unsigned().notNullable().defaultTo(0);

    table.index('template_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('task_template_items');
  await knex.schema.dropTableIfExists('task_templates');
}
