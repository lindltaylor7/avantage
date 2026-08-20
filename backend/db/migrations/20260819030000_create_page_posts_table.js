/**
 * Crea la tabla `page_posts`: caché de metadatos (imagen, texto, enlace) de
 * las publicaciones de Facebook referenciadas por las interacciones, para no
 * volver a consultar la Graph API por cada comentario/reacción del mismo post.
 */
export function up(knex) {
  return knex.schema.createTable('page_posts', (table) => {
    table.string('post_id', 100).primary();
    table.text('message').nullable();
    table.text('picture_url').nullable();
    table.text('permalink_url').nullable();
    table.timestamp('fetched_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('page_posts');
}
