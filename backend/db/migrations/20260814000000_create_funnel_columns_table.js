/**
 * Crea la tabla `funnel_columns`: las etapas (columnas) del Kanban de Leads,
 * antes almacenadas solo en localStorage del navegador. Cada fila define una
 * columna del funnel de ventas y su posición de despliegue.
 */
export function up(knex) {
  return knex.schema.createTable('funnel_columns', (table) => {
    table.increments('id').primary();
    table.string('key', 60).notNullable().unique();
    table.string('label', 150).notNullable();
    table.string('icon', 20).nullable();
    table.string('color', 20).nullable();
    table.boolean('final').notNullable().defaultTo(false);
    table.integer('position').unsigned().notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('funnel_columns');
}
