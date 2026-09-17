/**
 * Agrega `leads.total_amount`: el precio total acordado en el cierre de venta.
 *
 * Antes, el monto que el vendedor tipeaba en "Monto del primer pago" (al ganar
 * el lead) terminaba siendo, en la práctica, el precio total del trato — no
 * había dónde más ponerlo. Con este campo, Finanzas puede repartir el cobro
 * en varias cuotas (cada una con su propio comprobante y estado) validando
 * que la suma de lo registrado nunca supere este total.
 */
export async function up(knex) {
  await knex.schema.alterTable('leads', (table) => {
    table.decimal('total_amount', 12, 2).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('leads', (table) => {
    table.dropColumn('total_amount');
  });
}
