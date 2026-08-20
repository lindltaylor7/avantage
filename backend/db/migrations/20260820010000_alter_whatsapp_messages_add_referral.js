/**
 * Agrega `channel` y `referral` a `whatsapp_messages`: cuando un cliente
 * escribe después de tocar un anuncio o publicación de "Enviar mensaje" en
 * Facebook/Instagram, WhatsApp incluye un objeto "referral" en el mensaje del
 * webhook que permite detectar automáticamente el canal de origen.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.string('channel', 30).nullable();
    table.json('referral').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_messages', (table) => {
    table.dropColumn('channel');
    table.dropColumn('referral');
  });
}
