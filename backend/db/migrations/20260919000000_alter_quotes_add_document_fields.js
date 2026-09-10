/**
 * Agrega a la tabla `quotes` los campos necesarios para emitir el documento
 * de cotización con la marca de Avantage Group (concepto del servicio,
 * cantidad, viñetas de alcance, observaciones y fecha de validez).
 */
export function up(knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.string('concept_title', 200).notNullable().defaultTo('TESIS COMPLETA');
    table.integer('quantity').unsigned().notNullable().defaultTo(1);
    table.text('scope_items').nullable();
    table.date('valid_until').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.dropColumn('valid_until');
    table.dropColumn('scope_items');
    table.dropColumn('quantity');
    table.dropColumn('concept_title');
  });
}
