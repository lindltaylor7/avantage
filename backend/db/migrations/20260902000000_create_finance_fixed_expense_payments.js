/**
 * Control de pago mensual de los gastos fijos: por cada gasto fijo y cada mes
 * (periodo 'YYYY-MM') se registra si ya se pagó o sigue pendiente. Un gasto sin
 * fila para un mes se considera "pendiente" por defecto.
 */
export async function up(knex) {
  await knex.schema.createTable('finance_fixed_expense_payments', (table) => {
    table.increments('id').primary();
    table.integer('fixed_expense_id').unsigned().notNullable()
      .references('id').inTable('finance_fixed_expenses').onDelete('CASCADE');
    table.string('period', 7).notNullable(); // 'YYYY-MM'
    table.string('estado', 15).notNullable().defaultTo('pendiente'); // 'pagado' | 'pendiente'
    table.date('paid_at').nullable();
    table.integer('updated_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['fixed_expense_id', 'period']);
    table.index('period');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('finance_fixed_expense_payments');
}
