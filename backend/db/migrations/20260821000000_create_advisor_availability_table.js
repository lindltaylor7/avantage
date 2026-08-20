/**
 * Crea la tabla `advisor_availability`: horario semanal recurrente que cada
 * usuario (asesor) configura por sí mismo para indicar en qué bloques de
 * media hora está disponible para reuniones.
 */
export function up(knex) {
  return knex.schema.createTable('advisor_availability', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    // 0 = lunes ... 6 = domingo
    table.integer('day_of_week').unsigned().notNullable();
    table.string('start_time', 5).notNullable(); // "HH:MM"

    table.unique(['user_id', 'day_of_week', 'start_time']);
    table.index('user_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('advisor_availability');
}
