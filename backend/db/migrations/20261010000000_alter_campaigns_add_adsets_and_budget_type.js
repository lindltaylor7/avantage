/**
 * Completa la jerarquía de Meta en el panel: campaña → conjunto de anuncios →
 * anuncio.
 *
 *   - `meta_adsets_insights` : arreglo JSON con una fila por conjunto de
 *                              anuncios de la campaña (entrega, presupuesto y
 *                              las mismas métricas del informe). Igual que
 *                              `meta_ads_insights`, es una métrica derivada
 *                              que se reemplaza entera en cada sincronización.
 *   - `budget_type`          : si el presupuesto de la campaña es diario o
 *                              total. Meta los muestra distinto, y cuando la
 *                              campaña no tiene presupuesto propio significa
 *                              que lo lleva cada conjunto (CBO desactivado).
 */
export async function up(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.json('meta_adsets_insights').nullable();
    table.string('budget_type', 20).nullable(); // diario | total | null
  });
}

export async function down(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.dropColumn('budget_type');
    table.dropColumn('meta_adsets_insights');
  });
}
