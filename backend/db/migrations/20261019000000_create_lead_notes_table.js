/**
 * Bitácora de notas/observaciones por lead (`lead_notes`).
 *
 * El setter y el closer necesitan saber "en qué se quedó" cada conversación, y
 * hasta ahora el único campo libre era `leads.additional_notes`, que lo escribe
 * el propio prospecto en el evaluador de tesis: pisarlo con apuntes internos
 * mezclaría dos cosas distintas y además se perdería el apunte anterior.
 *
 * Por eso es una tabla y no una columna: son **varias** entradas por lead,
 * ordenadas en el tiempo, y lo que importa es el historial completo (qué se
 * dijo, cuándo y quién lo anotó), no el último estado.
 *
 * `author_name` guarda una copia del nombre del usuario a propósito: si a ese
 * usuario lo dan de baja, la nota tiene que seguir diciendo quién la escribió
 * — por eso `author_id` se pone en NULL al borrar el usuario, pero el nombre
 * permanece.
 */
export async function up(knex) {
  await knex.schema.createTable('lead_notes', (table) => {
    table.increments('id').primary();
    table.integer('lead_id').unsigned().notNullable()
      .references('id').inTable('leads').onDelete('CASCADE');
    table.integer('author_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.string('author_name', 150).nullable();
    table.text('body').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // El único acceso es "las notas de este lead, de la más nueva a la más
    // vieja": el índice compuesto cubre el filtro y el orden de una vez.
    table.index(['lead_id', 'created_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('lead_notes');
}
