/**
 * Crea la tabla `whatsapp_bot_sessions`: guarda el estado del flujo
 * conversacional automático de TesiBot cuando se ejecuta por WhatsApp
 * (mismas 5 preguntas que el chatbot web, adaptadas a mensajes de texto).
 */
export function up(knex) {
  return knex.schema.createTable('whatsapp_bot_sessions', (table) => {
    table.increments('id').primary();
    table.string('wa_id', 30).notNullable().unique();
    table.integer('step').notNullable().defaultTo(0);
    table.string('status', 20).notNullable().defaultTo('active');
    table.boolean('bot_enabled').notNullable().defaultTo(true);
    table.json('answers').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('whatsapp_bot_sessions');
}
