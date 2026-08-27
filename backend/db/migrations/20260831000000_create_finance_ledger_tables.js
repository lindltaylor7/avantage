/**
 * Tablas del libro contable de Finanzas, que reemplazan en la UI al panel
 * simple de `finance_transactions`:
 *
 *  - `finance_income`           → pestaña INGRESOS (código autogenerado por día,
 *                                  mes en letras, lead asociado, cuota, tipo de
 *                                  comprobante a emitir, monto, ITF calculado,
 *                                  banco, estado y campo tributario).
 *  - `finance_income_receipts`  → comprobantes (imágenes) de un ingreso (1:N).
 *  - `finance_journal`          → pestaña LIBRO DIARIO (detalle, monto con signo,
 *                                  moneda, ITF, banco, estado, área, asiento por
 *                                  destino y una imagen de comprobante inline).
 *  - `finance_fixed_expenses`   → pestaña GASTOS FIJOS (concepto, método de pago,
 *                                  fecha, detalle, banco).
 *
 * El acceso sigue controlado por el permiso existente `finance.view`, así que
 * esta migración no crea permisos nuevos.
 */
export async function up(knex) {
  await knex.schema.createTable('finance_income', (table) => {
    table.increments('id').primary();
    table.string('code', 20).notNullable();
    table.string('mes', 20).notNullable();
    table.date('fecha').notNullable();
    table.integer('lead_id').unsigned().nullable()
      .references('id').inTable('leads').onDelete('SET NULL');
    table.string('cuota', 10).notNullable();        // '1era' | '2da' | '3era'
    table.string('emitir', 20).notNullable();       // 'factura' | 'boleta' | 'nrus' | 'rxh' | 'c. interno'
    table.decimal('monto', 12, 2).notNullable();
    table.decimal('itf', 12, 2).notNullable().defaultTo(0);
    table.string('banco', 20).notNullable();        // 'BCP' | 'Interbank' | 'Efectivo'
    table.string('estado', 15).notNullable().defaultTo('no pagado'); // 'pagado' | 'no pagado'
    table.string('tributario', 255).nullable();
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('fecha');
    table.index('lead_id');
  });

  await knex.schema.createTable('finance_income_receipts', (table) => {
    table.increments('id').primary();
    table.integer('income_id').unsigned().notNullable()
      .references('id').inTable('finance_income').onDelete('CASCADE');
    table.string('filename', 255).notNullable();
    table.string('original_name', 255).nullable();
    table.string('mime_type', 150).nullable();
    table.integer('size').unsigned().nullable();
    table.timestamp('uploaded_at').defaultTo(knex.fn.now());

    table.index('income_id');
  });

  await knex.schema.createTable('finance_journal', (table) => {
    table.increments('id').primary();
    table.string('code', 20).notNullable();
    table.date('fecha').notNullable();
    table.text('detalle').notNullable();
    table.decimal('monto', 12, 2).notNullable();    // admite valores negativos
    table.string('moneda', 10).notNullable().defaultTo('soles'); // 'soles' | 'dolares'
    table.decimal('itf', 12, 2).notNullable().defaultTo(0);
    table.string('banco', 20).notNullable();
    table.string('estado', 15).notNullable().defaultTo('pendiente'); // 'pagado' | 'pendiente'
    table.string('area', 120).nullable();
    table.string('asiento_por_destino', 255).nullable();
    table.string('receipt_filename', 255).nullable();
    table.string('receipt_original_name', 255).nullable();
    table.string('receipt_mime_type', 150).nullable();
    table.integer('receipt_size').unsigned().nullable();
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('fecha');
  });

  await knex.schema.createTable('finance_fixed_expenses', (table) => {
    table.increments('id').primary();
    table.string('code', 20).notNullable();
    table.string('concepto', 150).notNullable();
    table.string('metodo_pago', 40).nullable();
    table.date('fecha').notNullable();
    table.text('detalle').nullable();
    table.string('banco', 20).nullable();
    table.integer('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('fecha');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('finance_fixed_expenses');
  await knex.schema.dropTableIfExists('finance_journal');
  await knex.schema.dropTableIfExists('finance_income_receipts');
  await knex.schema.dropTableIfExists('finance_income');
}
