/**
 * Agrega a `projects` un plazo (deadline) y un líder responsable (leader_id),
 * referenciando a un usuario interno.
 */
export function up(knex) {
  return knex.schema.alterTable('projects', (table) => {
    table.date('deadline').nullable();
    table.integer('leader_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.alterTable('projects', (table) => {
    table.dropForeign('leader_id');
    table.dropColumn('leader_id');
    table.dropColumn('deadline');
  });
}
