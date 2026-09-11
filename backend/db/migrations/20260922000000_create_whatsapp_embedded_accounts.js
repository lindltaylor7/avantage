/**
 * Crea `whatsapp_embedded_accounts`: una fila por cada WhatsApp Business
 * Account (WABA) vinculada vía el flujo de Embedded Signup (Facebook Login
 * for Business). Reemplaza en el tiempo a las variables de entorno estáticas
 * META_WHATSAPP_PHONE_NUMBER_ID / META_WHATSAPP_ACCESS_TOKEN cuando el número
 * se conecta desde el panel en vez de configurarse a mano en `.env`.
 *
 * `mode` registra si el número quedó en **coexistencia** (la app móvil de
 * WhatsApp Business del dueño del negocio sigue activa a la vez que la Cloud
 * API) o en **migración total** (el número se desconecta de la app y pasa a
 * responder solo por la Cloud API) — ver el comentario en
 * `metaEmbeddedSignupService.js` sobre dónde se decide esto.
 */
export async function up(knex) {
  await knex.schema.createTable('whatsapp_embedded_accounts', (table) => {
    table.increments('id').primary();
    table.string('waba_id', 64).notNullable().unique();
    table.string('phone_number_id', 64).notNullable();
    table.string('business_id', 64).nullable();
    // Token de sistema/usuario de larga duración devuelto por el intercambio
    // de código. En un despliegue real conviene cifrar esta columna en reposo
    // (p. ej. con KMS) en vez de guardarla en texto plano.
    table.text('access_token').notNullable();
    table.string('token_type', 30).nullable();
    table.integer('expires_in').nullable();
    table.string('mode', 20).notNullable().defaultTo('coexistence'); // coexistence | full_migration
    table.boolean('subscribed_webhooks').notNullable().defaultTo(false);
    // Respuesta cruda de /debug_token, para auditoría si algo falla.
    table.json('debug_token_response').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('whatsapp_embedded_accounts');
}
