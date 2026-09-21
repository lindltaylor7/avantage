/**
 * Agrega `university` y `career` a `contracts`.
 *
 * El modelo real de contrato nombra en su cláusula primera el reglamento de
 * la universidad y la carrera o mención del asesorado ("...la observancia del
 * reglamento de la UNAC y la carrera o mención de Ingeniería Eléctrica"), y
 * hasta ahora no había dónde guardarlos: quedaban escritos a mano dentro del
 * texto de la cláusula, contrato por contrato.
 *
 * Se copian del lead al crear el contrato (`leads.university` y
 * `leads.field_of_study`) y quedan editables en el contrato, igual que el
 * resto de los datos de las partes: un contrato emitido no cambia porque
 * alguien edite el lead después.
 */
export function up(knex) {
  return knex.schema.alterTable('contracts', (table) => {
    table.string('university', 255).nullable();
    table.string('career', 255).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('contracts', (table) => {
    table.dropColumn('university');
    table.dropColumn('career');
  });
}
