/**
 * Módulo de contratos:
 * - `contracts`: un contrato por fila, asociado (opcionalmente) a un lead del
 *   funnel. Los datos de las partes (nombre, DNI, domicilio, monto...) se
 *   copian del lead al crearlo y quedan editables en el contrato: un
 *   contrato emitido no debe cambiar solo porque alguien editó el lead.
 * - `contract_clauses`: las cláusulas de cada contrato, en orden. Se copian
 *   de la plantilla al crearlo y después se agregan, quitan o editan libres.
 * - Permiso `contracts.manage`, asignado al rol Administrador.
 */
export async function up(knex) {
  await knex.schema.createTable('contracts', (table) => {
    table.increments('id').primary();
    table.integer('lead_id').unsigned().nullable()
      .references('id').inTable('leads').onDelete('SET NULL');
    table.string('template_key', 40).notNullable();
    table.string('title', 255).notNullable();
    table.string('status', 20).notNullable().defaultTo('borrador'); // borrador | firmado | anulado
    table.string('client_name', 255).nullable();
    table.string('client_dni', 30).nullable();
    table.string('client_address', 255).nullable();
    table.string('client_email', 255).nullable();
    table.string('client_phone', 30).nullable();
    table.text('service_description').nullable();
    table.decimal('total_amount', 12, 2).nullable();
    table.string('currency', 3).notNullable().defaultTo('PEN');
    table.string('city', 100).nullable();
    table.date('contract_date').nullable();
    table.string('representative_name', 255).nullable();
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('lead_id');
  });

  await knex.schema.createTable('contract_clauses', (table) => {
    table.increments('id').primary();
    table.integer('contract_id').unsigned().notNullable()
      .references('id').inTable('contracts').onDelete('CASCADE');
    table.integer('position').unsigned().notNullable();
    table.string('title', 255).notNullable();
    table.text('body').notNullable();

    table.index(['contract_id', 'position']);
  });

  const existing = await knex('permissions').where({ key: 'contracts.manage' }).first();
  if (!existing) {
    const [permissionId] = await knex('permissions').insert({ key: 'contracts.manage', label: 'Contratos' });
    const adminRole = await knex('roles').where({ name: 'Administrador' }).first();
    if (adminRole) await knex('role_permissions').insert({ role_id: adminRole.id, permission_id: permissionId });
  }
}

export async function down(knex) {
  await knex('permissions').where({ key: 'contracts.manage' }).del();
  await knex.schema.dropTableIfExists('contract_clauses');
  await knex.schema.dropTableIfExists('contracts');
}
