/**
 * `primary_story_id` no sirve para mostrar la imagen del anuncio: los
 * anuncios de Meta Ads casi siempre usan un "dark post" (publicación no
 * publicada en el muro de la Página), y ese tipo de post no se puede leer
 * con `{post-id}?fields=full_picture` — el mecanismo que ya usaba
 * Interacciones Sociales para posts orgánicos reales (ver
 * pageInteractionService.getCachedPostImage). Confirmado en producción: la
 * Graph API devuelve 404 para el `object_story_id` de anuncios reales.
 *
 * La forma correcta es pedirle el thumbnail/imagen directamente al
 * creativo del anuncio (`creative.thumbnail_url` / `creative.image_url`,
 * campos propios de la Marketing API) y cachear esa imagen aparte — ver
 * metaAdsService.sync().
 */
export function up(knex) {
  return knex.schema.alterTable('campaigns', (table) => {
    table.dropColumn('primary_story_id');
    table.string('ad_image_filename', 255).nullable();
    table.string('ad_image_mime_type', 100).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('campaigns', (table) => {
    table.dropColumn('ad_image_filename');
    table.dropColumn('ad_image_mime_type');
    table.string('primary_story_id', 100).nullable();
  });
}
