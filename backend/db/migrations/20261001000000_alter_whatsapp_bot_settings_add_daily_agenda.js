/**
 * Agenda diaria para el vendedor: cada mañana Avan le manda al número de
 * `sales_notification_phone` la lista de reuniones y llamadas agendadas para
 * hoy.
 *
 * `daily_agenda_sent_on` guarda el día (en calendario de Lima) en que ya se
 * mandó. El aviso lo dispara el mismo barrido periódico que los recordatorios
 * —que corre cada diez minutos— así que sin esta marca el vendedor recibiría
 * la misma agenda seis veces por hora; y como vive en la base y no en memoria,
 * un reinicio del servidor a media mañana tampoco la repite.
 */
export async function up(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.date('daily_agenda_sent_on').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('daily_agenda_sent_on');
  });
}
