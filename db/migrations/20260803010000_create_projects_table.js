/**
 * Crea la tabla `projects`: cuando un lead llega al estado final del funnel
 * ("ganado"), se genera automáticamente un proyecto asociado con estado "Creado".
 */
export function up(knex) {
  return knex.schema.createTable('projects', (table) => {
    table.increments('id').primary();
    table.integer('lead_id').unsigned().notNullable().unique()
      .references('id').inTable('leads').onDelete('CASCADE');
    table.string('topic', 500).notNullable();
    table.string('client_email', 255).notNullable();
    table.string('client_phone', 30).notNullable();
    table.string('academic_level', 120).notNullable();
    table.string('field_of_study', 150).notNullable();
    table.string('status', 30).notNullable().defaultTo('Creado');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('projects');
}
