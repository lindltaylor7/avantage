/**
 * Agrega los rangos de precio (en soles) por nivel académico a
 * `whatsapp_bot_settings`, para que la primera vez que un lead pregunta por
 * el precio, Avan responda con un número real en vez de evadir la pregunta
 * (ver F1 del rediseño del bot: `handOffToAdvisor`/bloque de precio en
 * `whatsappBotService.js` y `backend/copy/whatsappBotCopy.js`). Se guardan en
 * settings (no hardcodeados en el copy) para que el equipo comercial los
 * pueda actualizar sin un deploy.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.integer('price_pregrado_min').unsigned().notNullable().defaultTo(3000);
    table.integer('price_pregrado_max').unsigned().notNullable().defaultTo(6000);
    table.integer('price_maestria_min').unsigned().notNullable().defaultTo(6000);
    table.integer('price_maestria_max').unsigned().notNullable().defaultTo(10000);
    table.integer('price_doctorado_min').unsigned().notNullable().defaultTo(10000);
    table.integer('price_doctorado_max').unsigned().notNullable().defaultTo(15000);
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_settings', (table) => {
    table.dropColumn('price_pregrado_min');
    table.dropColumn('price_pregrado_max');
    table.dropColumn('price_maestria_min');
    table.dropColumn('price_maestria_max');
    table.dropColumn('price_doctorado_min');
    table.dropColumn('price_doctorado_max');
  });
}
