/**
 * El libro diario pasa de un único comprobante inline (las columnas
 * `receipt_*` de `finance_journal`) a una tabla 1:N — `finance_journal_receipts`
 * — igual que la que ya usan los ingresos: un asiento suele respaldarse con
 * varias fotos/PDF (voucher, factura, constancia de abono...).
 *
 * Los comprobantes ya registrados se copian a la tabla nueva antes de borrar
 * las columnas, así que no se pierde ninguna referencia a un archivo de
 * `uploads/finance-receipts/`.
 */
export async function up(knex) {
  await knex.schema.createTable('finance_journal_receipts', (table) => {
    table.increments('id').primary();
    table.integer('journal_id').unsigned().notNullable()
      .references('id').inTable('finance_journal').onDelete('CASCADE');
    table.string('filename', 255).notNullable();
    table.string('original_name', 255).nullable();
    table.string('mime_type', 150).nullable();
    table.integer('size').unsigned().nullable();
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());

    table.index('journal_id');
  });

  const existing = await knex('finance_journal')
    .whereNotNull('receipt_filename')
    .select('id', 'receipt_filename', 'receipt_original_name', 'receipt_mime_type', 'receipt_size');

  if (existing.length > 0) {
    await knex('finance_journal_receipts').insert(existing.map((row) => ({
      journal_id: row.id,
      filename: row.receipt_filename,
      original_name: row.receipt_original_name,
      mime_type: row.receipt_mime_type,
      size: row.receipt_size
    })));
  }

  await knex.schema.alterTable('finance_journal', (table) => {
    table.dropColumn('receipt_filename');
    table.dropColumn('receipt_original_name');
    table.dropColumn('receipt_mime_type');
    table.dropColumn('receipt_size');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('finance_journal', (table) => {
    table.string('receipt_filename', 255).nullable();
    table.string('receipt_original_name', 255).nullable();
    table.string('receipt_mime_type', 150).nullable();
    table.integer('receipt_size').unsigned().nullable();
  });

  // Al volver atrás solo cabe un comprobante por asiento: se conserva el primero.
  const receipts = await knex('finance_journal_receipts').orderBy('id', 'asc');
  const seen = new Set();
  for (const rcpt of receipts) {
    if (seen.has(rcpt.journal_id)) continue;
    seen.add(rcpt.journal_id);
    await knex('finance_journal').where({ id: rcpt.journal_id }).update({
      receipt_filename: rcpt.filename,
      receipt_original_name: rcpt.original_name,
      receipt_mime_type: rcpt.mime_type,
      receipt_size: rcpt.size
    });
  }

  await knex.schema.dropTableIfExists('finance_journal_receipts');
}
