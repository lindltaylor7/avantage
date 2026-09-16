/**
 * Guarda una copia local del adjunto (imagen/video/audio/documento) de un
 * mensaje entrante de WhatsApp: el link que dan Meta y YCloud para
 * descargarlo caduca (a los minutos u horas, según el proveedor), así que sin
 * esta copia el panel no podía mostrarlo pasado ese tiempo.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.string('media_filename', 255).nullable();
    table.string('media_mime_type', 100).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.dropColumn('media_filename');
    table.dropColumn('media_mime_type');
  });
}
