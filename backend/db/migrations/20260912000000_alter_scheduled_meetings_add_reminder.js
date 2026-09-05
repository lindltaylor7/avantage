/**
 * Agrega `reminder_sent_at` a `scheduled_meetings`: marca cuándo se le mandó
 * al contacto el recordatorio previo a la reunión (2 horas antes, con el link
 * de Google Meet), para no repetirlo en cada barrido. Se guarda también
 * cuando el envío falla, para no reintentar en bucle hasta la hora de la cita.
 */
export function up(knex) {
  return knex.schema.alterTable('scheduled_meetings', (table) => {
    table.timestamp('reminder_sent_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('scheduled_meetings', (table) => {
    table.dropColumn('reminder_sent_at');
  });
}
