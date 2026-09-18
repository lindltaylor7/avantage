/**
 * Agrega a `leads` la ficha académica que recoge Avan con valores cerrados
 * (ver backend/services/leadQualification.js):
 * - `academic_status`: grado de instrucción actual (Estudiante, Egresado,
 *   Bachiller, Titulado, Magíster). Distinto de `academic_level`, que es el
 *   nivel del trabajo que busca (pregrado/maestría/doctorado).
 * - `academic_cycle`: ciclo que cursa, si es estudiante de pregrado. Es el
 *   dato que decide el filtro de calificación (se atiende desde 8.º ciclo).
 */
export async function up(knex) {
  await knex.schema.alterTable('leads', (table) => {
    table.string('academic_status', 30).nullable();
    table.tinyint('academic_cycle').unsigned().nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('leads', (table) => {
    table.dropColumn('academic_cycle');
    table.dropColumn('academic_status');
  });
}
