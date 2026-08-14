/**
 * Crea la tabla `project_updates`: hitos/actualizaciones publicados en la línea
 * de tiempo de un proyecto. Cada actualización es texto y, opcionalmente,
 * un único documento adjunto.
 */
export function up(knex) {
  return knex.schema.createTable('project_updates', (table) => {
    table.increments('id').primary();
    table.integer('project_id').unsigned().notNullable()
      .references('id').inTable('projects').onDelete('CASCADE');
    table.integer('author_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.text('content').notNullable();
    table.string('attachment_filename', 255).nullable();
    table.string('attachment_original_name', 255).nullable();
    table.string('attachment_mime_type', 150).nullable();
    table.integer('attachment_size').unsigned().nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('project_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('project_updates');
}
