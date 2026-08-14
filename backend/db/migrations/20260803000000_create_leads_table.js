/**
 * Crea la tabla `leads`: cada evaluación de tesis completada (con correo enviado)
 * registra un lead para que el equipo comercial le dé seguimiento.
 */
export function up(knex) {
  return knex.schema.createTable('leads', (table) => {
    table.increments('id').primary();
    table.string('topic', 500).notNullable();
    table.string('academic_level', 120).notNullable();
    table.string('field_of_study', 150).notNullable();
    table.string('email', 255).notNullable();
    table.string('phone', 30).notNullable();
    table.text('additional_notes').nullable();
    table.integer('overall_viability_score').unsigned().nullable();
    table.string('viability_level', 50).nullable();
    table.string('status', 30).notNullable().defaultTo('nuevo');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('email');
    table.index('phone');
    table.index('created_at');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('leads');
}
