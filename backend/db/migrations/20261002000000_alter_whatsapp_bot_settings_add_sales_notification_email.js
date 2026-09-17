/**
 * La agenda diaria del vendedor deja de mandarse por WhatsApp: a las 8 a.m.
 * lo normal es que la ventana de 24 h del negocio con ese número ya esté
 * cerrada, así que el aviso nunca llegaba y el barrido de cada diez minutos
 * lo reintentaba en bucle sin éxito. Ahora se manda por correo a
 * `sales_notification_email`, que no tiene esa ventana.
 */
export async function up(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.string('sales_notification_email', 255).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('sales_notification_email');
  });
}
