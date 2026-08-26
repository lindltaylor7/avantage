/**
 * Crea la tabla `finance_transactions` (ingresos y egresos del negocio) y el
 * permiso `finance.view` que controla el acceso al panel de Finanzas —
 * se asigna directamente al rol Administrador para no dejar el módulo
 * inaccesible tras la migración; desde Roles y Permisos se puede dar a
 * otros roles después.
 */
export async function up(knex) {
  await knex.schema.createTable('finance_transactions', (table) => {
    table.increments('id').primary();
    table.string('type', 10).notNullable(); // 'ingreso' | 'egreso'
    table.string('category', 80).notNullable();
    table.string('description', 255).nullable();
    table.decimal('amount', 12, 2).notNullable();
    table.date('transaction_date').notNullable();
    table.integer('project_id').unsigned().nullable()
      .references('id').inTable('projects').onDelete('SET NULL');
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('type');
    table.index('transaction_date');
  });

  const [existing] = await knex('permissions').where({ key: 'finance.view' }).select('id');
  if (!existing) {
    const [permissionId] = await knex('permissions').insert({
      key: 'finance.view',
      label: 'Finanzas (Ingresos y Egresos)'
    });
    const adminRole = await knex('roles').where({ name: 'Administrador' }).first();
    if (adminRole) {
      await knex('role_permissions').insert({ role_id: adminRole.id, permission_id: permissionId });
    }
  }
}

export async function down(knex) {
  await knex('permissions').where({ key: 'finance.view' }).del();
  await knex.schema.dropTableIfExists('finance_transactions');
}
