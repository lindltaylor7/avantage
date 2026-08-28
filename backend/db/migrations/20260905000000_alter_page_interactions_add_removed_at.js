/**
 * Marca en `page_interactions` cuándo un comentario o publicación fue
 * eliminado u ocultado (el webhook de Meta manda un cambio con
 * `verb: "remove" | "hide"` sobre el mismo comment_id / post_id). Así la
 * tarjeta original puede mostrarse tachada como "Eliminado" en vez de crear
 * una tarjeta nueva vacía.
 */
export async function up(knex) {
  await knex.schema.alterTable('page_interactions', (table) => {
    table.timestamp('removed_at').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('page_interactions', (table) => {
    table.dropColumn('removed_at');
  });
}
