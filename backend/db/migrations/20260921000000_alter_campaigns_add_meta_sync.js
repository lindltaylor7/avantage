/**
 * Prepara la tabla `campaigns` para sincronizarse con la Meta Marketing API:
 *
 *   - `source`          : 'manual' (creada en el panel) o 'meta' (importada).
 *   - `external_id`      : ID de la campaña en Meta Ads (para el upsert).
 *   - `last_synced_at`   : última vez que se trajeron datos de Meta.
 *   - `meta_status`      : estado crudo de Meta (ACTIVE / PAUSED / ...).
 *   - `meta_insights`    : JSON con las métricas de la Marketing API
 *                          (impresiones, alcance, clics, gasto, CPM, CPC, CTR,
 *                          conversaciones de mensajería iniciadas y la ventana
 *                          de tiempo consultada).
 */
export async function up(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.string('source', 20).notNullable().defaultTo('manual');
    table.string('external_id', 191).nullable();
    table.timestamp('last_synced_at').nullable();
    table.string('meta_status', 40).nullable();
    table.json('meta_insights').nullable();

    table.unique('external_id');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('campaigns', (table) => {
    table.dropUnique('external_id');
    table.dropColumn('meta_insights');
    table.dropColumn('meta_status');
    table.dropColumn('last_synced_at');
    table.dropColumn('external_id');
    table.dropColumn('source');
  });
}
