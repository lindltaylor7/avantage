/**
 * Agrega a la tabla `leads` los campos detallados para la gestión de prospectos:
 * Datos personales, académicos, ubicación, origen y asignación de asesor.
 */
export function up(knex) {
  return knex.schema.alterTable('leads', (table) => {
    table.string('full_name', 255).nullable();
    table.string('dni', 30).nullable();
    table.string('gender', 30).nullable();
    table.string('birth_date', 30).nullable();
    table.string('university', 255).nullable();
    table.string('thesis_situation', 150).nullable();
    table.string('department', 100).nullable();
    table.string('province', 100).nullable();
    table.string('address', 255).nullable();
    table.string('assigned_to', 100).nullable().defaultTo('Kevin');
    table.string('source', 100).nullable().defaultTo('Chatbot Web');

    table.index('full_name');
    table.index('dni');
    table.index('assigned_to');
  });
}

export function down(knex) {
  return knex.schema.alterTable('leads', (table) => {
    table.dropIndex('assigned_to');
    table.dropIndex('dni');
    table.dropIndex('full_name');

    table.dropColumn('source');
    table.dropColumn('assigned_to');
    table.dropColumn('address');
    table.dropColumn('province');
    table.dropColumn('department');
    table.dropColumn('thesis_situation');
    table.dropColumn('university');
    table.dropColumn('birth_date');
    table.dropColumn('gender');
    table.dropColumn('dni');
    table.dropColumn('full_name');
  });
}
