/**
 * Cronograma de pagos y entregables bloqueados por cobro.
 *
 * 1. `finance_income.due_date` — la fecha PACTADA de la cuota, que es distinta
 *    de `fecha` (el día en que el dinero entró / se asentó). Al cerrar la venta
 *    el vendedor deja armado el plan completo: una fila por cuota, todas
 *    `pendiente`, cada una con su vencimiento. El cronograma no es una tabla
 *    aparte porque entonces habría dos verdades sobre "cuánto debe el cliente":
 *    las cuotas del plan SON los ingresos de Finanzas desde el primer día.
 *
 * 2. `project_updates.income_id` — la cuota que libera ese entregable. Un
 *    avance se sube igual que siempre, pero si se ata a una cuota el cliente
 *    lo ve en su línea de tiempo con el adjunto bloqueado hasta que Finanzas
 *    verifique ese pago; ahí se habilita la descarga sin que nadie más toque
 *    nada. Sin `income_id` (todo lo anterior a este flujo) el adjunto se
 *    descarga como hasta ahora.
 */
export async function up(knex) {
  await knex.schema.alterTable('finance_income', (table) => {
    table.date('due_date').nullable().after('fecha');
  });

  // Las cuotas que ya existían se dan por vencidas el día en que se asentaron:
  // así el cronograma de un cierre viejo se lee completo en vez de con huecos.
  await knex('finance_income').whereNull('due_date').update({ due_date: knex.ref('fecha') });

  await knex.schema.alterTable('project_updates', (table) => {
    table.integer('income_id').unsigned().nullable()
      .references('id').inTable('finance_income').onDelete('SET NULL');
    table.index('income_id');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('project_updates', (table) => {
    table.dropForeign('income_id');
    table.dropIndex('income_id');
    table.dropColumn('income_id');
  });
  await knex.schema.alterTable('finance_income', (table) => {
    table.dropColumn('due_date');
  });
}
