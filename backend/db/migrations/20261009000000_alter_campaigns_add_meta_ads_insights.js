/**
 * Guarda el desglose por anuncio que devuelve la Meta Marketing API
 * (`/insights?level=ad`) en `campaigns.meta_ads_insights`.
 *
 * Varias de las columnas del Administrador de anuncios sólo existen a nivel
 * de anuncio y no se pueden agregar a nivel de campaña: el nombre del
 * anuncio, su entrega (`effective_status`), el presupuesto del conjunto al
 * que pertenece y —sobre todo— las tres clasificaciones de calidad
 * (`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`),
 * que Meta calcula comparando cada anuncio con su competencia.
 *
 * Es un JSON (un arreglo de filas, una por anuncio) en vez de una tabla
 * porque son métricas derivadas y desechables: se reemplazan enteras en cada
 * sincronización y siempre corresponden a la ventana de tiempo consultada.
 */
export async function up(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.json('meta_ads_insights').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.dropColumn('meta_ads_insights');
  });
}
