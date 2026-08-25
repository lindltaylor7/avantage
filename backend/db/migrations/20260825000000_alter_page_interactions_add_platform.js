/**
 * Agrega la columna `platform` a `page_interactions` para poder separar en la
 * interfaz las interacciones de Facebook de las de Instagram: hasta ahora
 * ambas se guardaban en la misma tabla sin ninguna forma confiable de saber
 * de dónde venía cada fila (se intentaba adivinar por item_type/raw_value),
 * lo que hacía que los comentarios de Instagram aparecieran mezclados en la
 * vista de "Reacciones" de Facebook y viceversa.
 */
export function up(knex) {
  return knex.schema
    .alterTable('page_interactions', (table) => {
      table.string('platform', 20).notNullable().defaultTo('facebook');
    })
    .then(() =>
      // Los comentarios de Instagram guardados antes de esta migración se
      // distinguen porque su raw_value trae el campo "media" (propio del
      // payload de Instagram Graph API), a diferencia del feed de Facebook.
      knex('page_interactions')
        .whereRaw("raw_value LIKE '%\"media\":%'")
        .update({ platform: 'instagram' })
    )
    .then(() => knex.schema.alterTable('page_interactions', (table) => {
      table.index('platform');
    }));
}

export function down(knex) {
  return knex.schema.alterTable('page_interactions', (table) => {
    table.dropColumn('platform');
  });
}
