/**
 * Crea las tablas para el módulo de Campañas de marketing digital:
 *
 *   - `campaigns`      : la campaña tal como la define el equipo (nombre
 *                        legible, plataforma, presupuesto/gasto manual y
 *                        fechas). El costo se ingresa a mano porque no hay
 *                        integración con la Meta Marketing API todavía.
 *   - `campaign_ads`   : mapea uno o varios IDs de anuncio (`source_id` del
 *                        objeto `referral` de WhatsApp Click-to-WhatsApp) a
 *                        una campaña. Un anuncio pertenece a una sola campaña.
 *
 * El rendimiento (embudo, tasas, costo por etapa) se calcula en vivo cruzando
 * estas tablas con `whatsapp_messages`, `leads`, `whatsapp_bot_sessions`,
 * `scheduled_meetings` y `quotes`.
 */
export async function up(knex) {
  await knex.schema.createTable('campaigns', (table) => {
    table.increments('id').primary();
    table.string('name', 200).notNullable();
    table.string('platform', 30).notNullable().defaultTo('meta'); // instagram | facebook | meta | whatsapp | other
    table.string('objective', 120).nullable();
    table.string('status', 20).notNullable().defaultTo('activa'); // activa | pausada | finalizada
    table.decimal('budget_total', 12, 2).notNullable().defaultTo(0);
    table.decimal('spend_to_date', 12, 2).nullable();
    table.string('currency', 10).notNullable().defaultTo('PEN');
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.text('notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('status');
  });

  await knex.schema.createTable('campaign_ads', (table) => {
    table.increments('id').primary();
    table.integer('campaign_id').unsigned().notNullable()
      .references('id').inTable('campaigns').onDelete('CASCADE');
    table.string('ad_source_id', 191).notNullable().unique();
    table.string('ad_label', 300).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('campaign_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('campaign_ads');
  await knex.schema.dropTableIfExists('campaigns');
}
