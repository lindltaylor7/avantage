/**
 * Guarda, por usuario, la conexión OAuth con su propio Google Calendar (un
 * asesor conecta su cuenta desde "Disponibilidad" para que las reuniones se
 * creen directamente ahí, con link de Google Meet incluido).
 */
export function up(knex) {
  return knex.schema.createTable('google_calendar_connections', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('google_email', 255).nullable();
    table.text('access_token').notNullable();
    table.text('refresh_token').nullable();
    table.timestamp('access_token_expires_at').nullable();
    table.string('scope', 255).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique('user_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('google_calendar_connections');
}
