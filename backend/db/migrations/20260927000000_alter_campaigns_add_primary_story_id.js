/**
 * Guarda el `object_story_id` (o media de Instagram) del primer anuncio
 * mapeado a la campaña, para poder mostrar su imagen real en el panel — es
 * el mismo ID de post que ya usa `pageInteractionService.getCachedPostImage()`
 * para las miniaturas de Interacciones Sociales, así que no hace falta un
 * mecanismo de descarga/caché nuevo, solo reutilizar ese endpoint.
 */
export function up(knex) {
  return knex.schema.alterTable('campaigns', (table) => {
    table.string('primary_story_id', 100).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('campaigns', (table) => {
    table.dropColumn('primary_story_id');
  });
}
