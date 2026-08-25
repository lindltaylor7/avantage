/**
 * Crea la tabla `scheduled_meetings`: registro propio (además del evento
 * real en Google Calendar) de cada llamada que Avan agenda automáticamente,
 * para poder listar "Próximas reuniones" dentro del panel de Avantage sin
 * depender de una consulta en vivo a la API de Google.
 */
export function up(knex) {
  return knex.schema.createTable('scheduled_meetings', (table) => {
    table.increments('id').primary();
    table.integer('lead_id').unsigned().nullable()
      .references('id').inTable('leads').onDelete('SET NULL');
    table.string('wa_id', 30).notNullable();
    table.integer('advisor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('topic', 500).nullable();
    table.datetime('start_time').notNullable();
    table.datetime('end_time').notNullable();
    table.string('meet_link', 500).nullable();
    table.string('calendar_event_id', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('advisor_user_id');
    table.index('start_time');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('scheduled_meetings');
}
