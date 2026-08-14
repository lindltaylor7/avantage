/**
 * Crea la tabla `quotes`: cotizaciones generadas para un lead que se
 * encuentra en las etapas "contactado" o "en_negociacion" del funnel.
 */
export function up(knex) {
  return knex.schema.createTable('quotes', (table) => {
    table.increments('id').primary();
    table.integer('lead_id').unsigned().notNullable()
      .references('id').inTable('leads').onDelete('CASCADE');
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 10).notNullable().defaultTo('PEN');
    table.text('notes').nullable();
    table.string('status', 30).notNullable().defaultTo('enviada');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('lead_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('quotes');
}
