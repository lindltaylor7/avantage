/**
 * Las URLs de imagen de Meta (`full_picture` de Facebook, `thumbnail_url` /
 * `media_url` de Instagram) van firmadas y caducan a las pocas horas, así que
 * guardarlas y mostrarlas después falla con "URL signature has expired".
 *
 * Se agrega a `page_posts` la referencia a una copia local de la miniatura
 * (descargada bajo demanda a `uploads/social-posts/` y servida por el propio
 * backend), para que las tarjetas de Interacciones siempre tengan imagen.
 */
export async function up(knex) {
  await knex.schema.alterTable('page_posts', (table) => {
    table.string('local_filename', 255).nullable();
    table.string('mime_type', 100).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('page_posts', (table) => {
    table.dropColumn('local_filename');
    table.dropColumn('mime_type');
  });
}
