/**
 * Portal de clientes: login separado del panel interno para que cada cliente
 * vea sus propios proyectos y suba el comprobante de sus cuotas.
 *
 * La identidad es el correo (el mismo `projects.client_email` que ya existe),
 * así que no hace falta una FK a `projects` — un cliente puede tener varias
 * filas ahí con el mismo correo si repite compra.
 *
 * La cuenta nace SIN `password_hash` (inservible para loguear) cuando se crea
 * un proyecto nuevo, con un `activation_token` que solo llega por correo al
 * cliente real. Nadie se auto-registra solo por conocer un correo.
 */
export async function up(knex) {
  await knex.schema.createTable('client_accounts', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).nullable();
    table.string('name', 255).nullable();
    table.string('activation_token', 128).nullable().unique();
    table.timestamp('activation_token_expires_at').nullable();
    table.string('reset_token', 128).nullable().unique();
    table.timestamp('reset_token_expires_at').nullable();
    table.timestamp('last_login_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('client_accounts');
}
