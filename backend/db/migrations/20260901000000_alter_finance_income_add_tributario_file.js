/**
 * El campo `tributario` de INGRESOS pasa a admitir, además del texto, un
 * archivo o imagen adjunto (una constancia / documento tributario). Se guarda
 * inline en la misma fila, igual que el comprobante del libro diario; el
 * fichero vive en `uploads/finance-receipts/`.
 */
export async function up(knex) {
  await knex.schema.alterTable('finance_income', (table) => {
    table.string('tributario_filename', 255).nullable();
    table.string('tributario_original_name', 255).nullable();
    table.string('tributario_mime_type', 150).nullable();
    table.integer('tributario_size').unsigned().nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('finance_income', (table) => {
    table.dropColumn('tributario_filename');
    table.dropColumn('tributario_original_name');
    table.dropColumn('tributario_mime_type');
    table.dropColumn('tributario_size');
  });
}
