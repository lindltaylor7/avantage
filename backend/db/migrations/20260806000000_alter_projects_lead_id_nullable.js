/**
 * Permite crear proyectos libremente, sin que provengan necesariamente de un
 * lead ganado en el funnel de ventas. `lead_id` pasa a ser opcional.
 */
export function up(knex) {
  return knex.schema.alterTable('projects', (table) => {
    table.integer('lead_id').unsigned().nullable().alter();
  });
}

export function down(knex) {
  return knex.schema.alterTable('projects', (table) => {
    table.integer('lead_id').unsigned().notNullable().alter();
  });
}
