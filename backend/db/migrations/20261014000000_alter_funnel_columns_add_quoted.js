/**
 * Agrega `quoted` a `funnel_columns`: marca cuál de las columnas del Kanban
 * de Leads significa "ya se le cotizó".
 *
 * Las columnas son configurables por el equipo y sus claves se generan solas
 * (`col_mtc2nwec_fij`), así que no hay forma de deducir cuál es la etapa de
 * cotización — hay que declararla, igual que se declara la etapa ganadora con
 * `final`. Con eso, al generar una cotización el lead se mueve solo a esa
 * columna (ver POST /api/leads/:id/quote); si ninguna está marcada, no se
 * mueve nada y el panel lo avisa.
 */
export function up(knex) {
  return knex.schema.alterTable('funnel_columns', (table) => {
    table.boolean('quoted').notNullable().defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable('funnel_columns', (table) => {
    table.dropColumn('quoted');
  });
}
