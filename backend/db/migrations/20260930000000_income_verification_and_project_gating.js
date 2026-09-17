/**
 * Flujo de cierre de venta: del lead ganado al proyecto activo.
 *
 * Cuando el vendedor pasa un lead a "Ganado" registra el monto del primer pago,
 * que nace como un ingreso de Finanzas y es el que desbloquea el proyecto:
 *
 *   pendiente  → el vendedor cerró la venta, todavía no hay voucher.
 *   pagado     → alguien (vendedor o finanzas) adjuntó el comprobante.
 *   verificado → SOLO finanzas, con el permiso `finance.verify`, dio el visto
 *                bueno. Recién ahí el ingreso suma en las cifras de Finanzas y
 *                el proyecto pasa de "Creado" (bloqueado) a "Activo".
 *
 * Los ingresos que ya existían con estado "no pagado" pasan a "pendiente" (es
 * el mismo significado con el nombre nuevo); los que estaban en "pagado" se
 * quedan ahí, a la espera de que finanzas los verifique uno por uno.
 */
export async function up(knex) {
  await knex.schema.alterTable('finance_income', (table) => {
    // Marca el ingreso creado al cerrar la venta: es el que abre el proyecto.
    table.boolean('is_initial_payment').notNullable().defaultTo(false);
    table.timestamp('verified_at').nullable();
    table.integer('verified_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
  });

  await knex('finance_income').where({ estado: 'no pagado' }).update({ estado: 'pendiente' });

  const [existing] = await knex('permissions').where({ key: 'finance.verify' }).select('id');
  if (!existing) {
    const [permissionId] = await knex('permissions').insert({
      key: 'finance.verify',
      label: 'Verificar ingresos (Finanzas)'
    });
    const adminRole = await knex('roles').where({ name: 'Administrador' }).first();
    if (adminRole) {
      await knex('role_permissions').insert({ role_id: adminRole.id, permission_id: permissionId });
    }
  }
}

export async function down(knex) {
  await knex('finance_income').where({ estado: 'verificado' }).update({ estado: 'pagado' });
  await knex('finance_income').where({ estado: 'pendiente' }).update({ estado: 'no pagado' });

  await knex.schema.alterTable('finance_income', (table) => {
    table.dropColumn('is_initial_payment');
    table.dropColumn('verified_at');
    table.dropColumn('verified_by');
  });

  const permission = await knex('permissions').where({ key: 'finance.verify' }).first();
  if (permission) {
    await knex('role_permissions').where({ permission_id: permission.id }).del();
    await knex('permissions').where({ id: permission.id }).del();
  }
}
