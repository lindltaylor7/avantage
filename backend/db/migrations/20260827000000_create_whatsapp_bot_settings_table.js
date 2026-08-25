/**
 * Crea la tabla `whatsapp_bot_settings`: fila única con la configuración del
 * nuevo motor conversacional de Avan (reemplaza al guion de 5 preguntas
 * fijas de `whatsapp_bot_steps`). El equipo ajusta el tono/objetivo de la
 * conversación y los valores por defecto que se usan cuando el lead no
 * menciona su nivel, carrera o ámbito.
 */
export function up(knex) {
  return knex.schema.createTable('whatsapp_bot_settings', (table) => {
    table.increments('id').primary();
    table.text('tone_instructions').nullable();
    table.string('default_academic_level', 120).notNullable().defaultTo('Pregrado (Bachiller/Título)');
    table.string('default_field_of_study', 150).notNullable().defaultTo('Ingeniería de Sistemas y Computación');
    table.string('default_location', 150).notNullable().defaultTo('Perú');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  }).then(() => {
    return knex('whatsapp_bot_settings').insert({
      tone_instructions: 'Sé cercano y genuinamente curioso sobre el tema del contacto antes de pasar a lo académico. Si el contacto se nota apurado o solo quiere agendar una llamada, no lo detengas con más preguntas de las estrictamente necesarias (tema y correo).'
    });
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('whatsapp_bot_settings');
}
