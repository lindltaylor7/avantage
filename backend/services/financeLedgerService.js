import fs from 'fs';
import path from 'path';
import { db } from '../db/connection.js';
import { financeReceiptDir } from '../middleware/upload.js';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export const CUOTAS = ['1era', '2da', '3era'];
export const EMITIR_OPCIONES = ['factura', 'boleta', 'nrus', 'rxh', 'c. interno'];
export const BANCOS = ['BCP', 'Interbank', 'Efectivo'];
export const MONEDAS = ['soles', 'dolares'];
export const ESTADOS_INGRESO = ['pagado', 'no pagado'];
export const ESTADOS_DIARIO = ['pagado', 'pendiente'];

/** ITF según la fórmula del Excel: IF(H<1000, 0, INT(H/1000)*0.05), sobre el valor absoluto. */
function calcItf(monto) {
  const a = Math.abs(Number(monto) || 0);
  if (a < 1000) return 0;
  return Math.round(Math.floor(a / 1000) * 0.05 * 100) / 100;
}

function dayOnly(fecha) {
  return String(fecha).slice(0, 10);
}

function mesEnLetras(fecha) {
  const idx = Number(dayOnly(fecha).slice(5, 7)) - 1;
  return MESES[idx] || '';
}

/** Código autogenerado: YYYYMMDD-N, con N incremental entre los registros del mismo día. */
async function nextCode(table, fecha) {
  const day = dayOnly(fecha);
  const prefix = day.replace(/-/g, '');
  const [{ count }] = await db(table).where('fecha', day).count({ count: '*' });
  return `${prefix}-${Number(count) + 1}`;
}

function unlinkQuiet(filename) {
  if (!filename) return;
  fs.unlink(path.join(financeReceiptDir, filename), () => {});
}

function receiptColumnsFromFile(file) {
  return {
    receipt_filename: file?.filename || null,
    receipt_original_name: file?.originalname || null,
    receipt_mime_type: file?.mimetype || null,
    receipt_size: file?.size || null
  };
}

/**
 * Libro contable de Finanzas: ingresos (con comprobantes hijos), libro diario y
 * gastos fijos. Cada registro lleva un código autogenerado por día y las
 * pestañas de ingresos/diario calculan el ITF automáticamente.
 */
export class FinanceLedgerService {
  /** Directorio ligero de leads para el selector de la pestaña INGRESOS. */
  async listLeadsDirectory() {
    return db('leads')
      .select('id', 'dni')
      .select(db.raw("COALESCE(NULLIF(full_name, ''), topic) as name"))
      .orderBy('name', 'asc');
  }

  // ---------------------------------------------------------------- INGRESOS

  async listIncome() {
    const rows = await db('finance_income')
      .leftJoin('leads', 'leads.id', 'finance_income.lead_id')
      .leftJoin('users', 'users.id', 'finance_income.created_by')
      .select(
        'finance_income.*',
        db.raw("COALESCE(NULLIF(leads.full_name, ''), leads.topic) as lead_name"),
        'leads.dni as lead_dni',
        'leads.email as lead_email',
        'leads.phone as lead_phone',
        'users.name as created_by_name'
      )
      .orderBy('finance_income.fecha', 'desc')
      .orderBy('finance_income.id', 'desc');

    if (rows.length === 0) return rows;

    const receipts = await db('finance_income_receipts')
      .whereIn('income_id', rows.map((r) => r.id))
      .orderBy('id', 'asc');

    const byIncome = new Map();
    for (const rcpt of receipts) {
      if (!byIncome.has(rcpt.income_id)) byIncome.set(rcpt.income_id, []);
      byIncome.get(rcpt.income_id).push(rcpt);
    }
    return rows.map((r) => ({ ...r, receipts: byIncome.get(r.id) || [] }));
  }

  async getIncomeById(id) {
    const row = await db('finance_income')
      .leftJoin('leads', 'leads.id', 'finance_income.lead_id')
      .leftJoin('users', 'users.id', 'finance_income.created_by')
      .select(
        'finance_income.*',
        db.raw("COALESCE(NULLIF(leads.full_name, ''), leads.topic) as lead_name"),
        'leads.dni as lead_dni',
        'leads.email as lead_email',
        'leads.phone as lead_phone',
        'users.name as created_by_name'
      )
      .where('finance_income.id', id)
      .first();
    if (!row) return null;
    row.receipts = await db('finance_income_receipts').where('income_id', id).orderBy('id', 'asc');
    return row;
  }

  async createIncome({ fecha, leadId, cuota, emitir, monto, banco, estado, tributario, createdBy }) {
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!CUOTAS.includes(cuota)) throw new Error('La cuota debe ser 1era, 2da o 3era.');
    if (!EMITIR_OPCIONES.includes(emitir)) throw new Error('El campo "emitir" no es válido.');
    if (!BANCOS.includes(banco)) throw new Error('El banco debe ser BCP, Interbank o Efectivo.');
    const estadoFinal = ESTADOS_INGRESO.includes(estado) ? estado : 'no pagado';
    const numericMonto = Number(monto);
    if (!Number.isFinite(numericMonto) || numericMonto <= 0) {
      throw new Error('El monto debe ser un número mayor a 0.');
    }

    const day = dayOnly(fecha);
    const [id] = await db('finance_income').insert({
      code: await nextCode('finance_income', day),
      mes: mesEnLetras(day),
      fecha: day,
      lead_id: leadId || null,
      cuota,
      emitir,
      monto: numericMonto,
      itf: calcItf(numericMonto),
      banco,
      estado: estadoFinal,
      tributario: tributario?.trim() || null,
      created_by: createdBy || null
    });
    return this.getIncomeById(id);
  }

  async updateIncomeEstado(id, estado) {
    if (!ESTADOS_INGRESO.includes(estado)) {
      throw new Error('El estado debe ser "pagado" o "no pagado".');
    }
    const updated = await db('finance_income').where({ id }).update({ estado });
    if (!updated) return null;
    return this.getIncomeById(id);
  }

  /** Adjunta (o reemplaza) el archivo/imagen del campo tributario de un ingreso. */
  async setTributarioFile(id, file) {
    if (!file) throw new Error('No se recibió ningún archivo.');
    const income = await db('finance_income').where({ id }).first();
    if (!income) {
      unlinkQuiet(file.filename);
      throw new Error('Ingreso no encontrado.');
    }
    unlinkQuiet(income.tributario_filename);
    await db('finance_income').where({ id }).update({
      tributario_filename: file.filename,
      tributario_original_name: file.originalname || null,
      tributario_mime_type: file.mimetype || null,
      tributario_size: file.size || null
    });
    return this.getIncomeById(id);
  }

  async deleteTributarioFile(id) {
    const income = await db('finance_income').where({ id }).first();
    if (!income) return null;
    unlinkQuiet(income.tributario_filename);
    await db('finance_income').where({ id }).update({
      tributario_filename: null,
      tributario_original_name: null,
      tributario_mime_type: null,
      tributario_size: null
    });
    return this.getIncomeById(id);
  }

  async deleteIncome(id) {
    const income = await db('finance_income').where({ id }).select('tributario_filename').first();
    if (income) unlinkQuiet(income.tributario_filename);
    const receipts = await db('finance_income_receipts').where('income_id', id).select('filename');
    receipts.forEach((r) => unlinkQuiet(r.filename));
    return db('finance_income').where({ id }).del();
  }

  // ------------------------------------------------------------ COMPROBANTES

  async addIncomeReceipt(incomeId, file) {
    if (!file) throw new Error('No se recibió ninguna imagen.');
    const income = await db('finance_income').where({ id: incomeId }).first();
    if (!income) {
      unlinkQuiet(file.filename);
      throw new Error('Ingreso no encontrado.');
    }
    const [id] = await db('finance_income_receipts').insert({
      income_id: incomeId,
      filename: file.filename,
      original_name: file.originalname || null,
      mime_type: file.mimetype || null,
      size: file.size || null
    });
    return db('finance_income_receipts').where({ id }).first();
  }

  async getReceiptById(id) {
    return db('finance_income_receipts').where({ id }).first();
  }

  async deleteReceipt(id) {
    const receipt = await db('finance_income_receipts').where({ id }).first();
    if (receipt) unlinkQuiet(receipt.filename);
    return db('finance_income_receipts').where({ id }).del();
  }

  // ------------------------------------------------------------- LIBRO DIARIO

  async listJournal() {
    return db('finance_journal')
      .leftJoin('users', 'users.id', 'finance_journal.created_by')
      .select('finance_journal.*', 'users.name as created_by_name')
      .orderBy('finance_journal.fecha', 'desc')
      .orderBy('finance_journal.id', 'desc');
  }

  async getJournalById(id) {
    return db('finance_journal')
      .leftJoin('users', 'users.id', 'finance_journal.created_by')
      .select('finance_journal.*', 'users.name as created_by_name')
      .where('finance_journal.id', id)
      .first();
  }

  async createJournal({ fecha, detalle, monto, moneda, banco, estado, area, asientoPorDestino, receipt, createdBy }) {
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!detalle || !detalle.trim()) throw new Error('El detalle es obligatorio.');
    if (!BANCOS.includes(banco)) throw new Error('El banco debe ser BCP, Interbank o Efectivo.');
    const numericMonto = Number(monto);
    if (!Number.isFinite(numericMonto)) throw new Error('El monto debe ser un número.');
    const monedaFinal = MONEDAS.includes(moneda) ? moneda : 'soles';
    const estadoFinal = ESTADOS_DIARIO.includes(estado) ? estado : 'pendiente';

    const day = dayOnly(fecha);
    try {
      const [id] = await db('finance_journal').insert({
        code: await nextCode('finance_journal', day),
        fecha: day,
        detalle: detalle.trim(),
        monto: numericMonto,
        moneda: monedaFinal,
        itf: calcItf(numericMonto),
        banco,
        estado: estadoFinal,
        area: area?.trim() || null,
        asiento_por_destino: asientoPorDestino?.trim() || null,
        ...receiptColumnsFromFile(receipt),
        created_by: createdBy || null
      });
      return this.getJournalById(id);
    } catch (error) {
      unlinkQuiet(receipt?.filename);
      throw error;
    }
  }

  async deleteJournal(id) {
    const row = await db('finance_journal').where({ id }).select('receipt_filename').first();
    if (row) unlinkQuiet(row.receipt_filename);
    return db('finance_journal').where({ id }).del();
  }

  // ------------------------------------------------------------- GASTOS FIJOS

  async listFixedExpenses() {
    return db('finance_fixed_expenses')
      .leftJoin('users', 'users.id', 'finance_fixed_expenses.created_by')
      .select('finance_fixed_expenses.*', 'users.name as created_by_name')
      .orderBy('finance_fixed_expenses.fecha', 'desc')
      .orderBy('finance_fixed_expenses.id', 'desc');
  }

  async createFixedExpense({ fecha, concepto, metodoPago, detalle, banco, createdBy }) {
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!concepto || !concepto.trim()) throw new Error('El concepto es obligatorio.');
    const bancoFinal = banco && BANCOS.includes(banco) ? banco : (banco?.trim() || null);

    const day = dayOnly(fecha);
    const [id] = await db('finance_fixed_expenses').insert({
      code: await nextCode('finance_fixed_expenses', day),
      concepto: concepto.trim(),
      metodo_pago: metodoPago?.trim() || null,
      fecha: day,
      detalle: detalle?.trim() || null,
      banco: bancoFinal,
      created_by: createdBy || null
    });
    return db('finance_fixed_expenses').where({ id }).first();
  }

  async updateFixedExpense(id, { fecha, concepto, metodoPago, detalle, banco }) {
    const existing = await db('finance_fixed_expenses').where({ id }).first();
    if (!existing) return null;
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!concepto || !concepto.trim()) throw new Error('El concepto es obligatorio.');
    const bancoFinal = banco && BANCOS.includes(banco) ? banco : (banco?.trim() || null);

    await db('finance_fixed_expenses').where({ id }).update({
      fecha: dayOnly(fecha),
      concepto: concepto.trim(),
      metodo_pago: metodoPago?.trim() || null,
      detalle: detalle?.trim() || null,
      banco: bancoFinal
    });
    return db('finance_fixed_expenses').where({ id }).first();
  }

  async deleteFixedExpense(id) {
    return db('finance_fixed_expenses').where({ id }).del();
  }

  /**
   * Panel de control de pago mensual: cada gasto fijo con el estado
   * (pagado/pendiente) de los últimos `monthsBack` meses.
   */
  async getFixedExpensesPanel({ monthsBack = 6 } = {}) {
    const months = Math.min(Math.max(Number(monthsBack) || 6, 1), 24);
    const now = new Date();
    const periods = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const expenses = await db('finance_fixed_expenses')
      .select('id', 'code', 'concepto', 'metodo_pago', 'banco')
      .orderBy('concepto', 'asc');

    if (expenses.length === 0) return { periods, expenses: [] };

    const payments = await db('finance_fixed_expense_payments')
      .whereIn('fixed_expense_id', expenses.map((e) => e.id))
      .whereIn('period', periods)
      .select('fixed_expense_id', 'period', 'estado', 'paid_at');

    const byExpense = new Map();
    for (const p of payments) {
      if (!byExpense.has(p.fixed_expense_id)) byExpense.set(p.fixed_expense_id, {});
      byExpense.get(p.fixed_expense_id)[p.period] = { estado: p.estado, paid_at: p.paid_at };
    }

    return {
      periods,
      expenses: expenses.map((e) => ({
        ...e,
        payments: Object.fromEntries(periods.map((period) => [
          period,
          byExpense.get(e.id)?.[period] || { estado: 'pendiente', paid_at: null }
        ]))
      }))
    };
  }

  /** Marca (upsert) el estado de pago de un gasto fijo para un mes concreto. */
  async setFixedExpensePayment(expenseId, period, { estado, updatedBy } = {}) {
    if (!/^\d{4}-\d{2}$/.test(period || '')) {
      throw new Error('El periodo debe tener el formato YYYY-MM.');
    }
    if (!['pagado', 'pendiente'].includes(estado)) {
      throw new Error('El estado debe ser "pagado" o "pendiente".');
    }
    const expense = await db('finance_fixed_expenses').where({ id: expenseId }).first();
    if (!expense) throw new Error('Gasto fijo no encontrado.');

    const row = {
      fixed_expense_id: expenseId,
      period,
      estado,
      paid_at: estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null,
      updated_by: updatedBy || null,
      updated_at: db.fn.now()
    };

    await db('finance_fixed_expense_payments')
      .insert(row)
      .onConflict(['fixed_expense_id', 'period'])
      .merge(['estado', 'paid_at', 'updated_by', 'updated_at']);

    return db('finance_fixed_expense_payments')
      .where({ fixed_expense_id: expenseId, period })
      .first();
  }

  // --------------------------------------------------------------- FINANZAS

  /**
   * Resumen para la pestaña FINANZAS: ingresos y egresos por mes, desglosados
   * por banco (BCP, Interbank, Efectivo).
   *
   *  - Ingresos = `finance_income` + asientos positivos del libro diario (en soles).
   *  - Egresos  = asientos negativos del libro diario (en soles, en valor absoluto).
   */
  async getOverview({ monthsBack = 6 } = {}) {
    const months = Math.min(Math.max(Number(monthsBack) || 6, 1), 24);
    const now = new Date();
    const monthKeys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const earliest = `${monthKeys[0]}-01`;

    const incomeRows = await db('finance_income')
      .select('banco')
      .select(db.raw("DATE_FORMAT(fecha, '%Y-%m') as month"))
      .sum('monto as total')
      .where('fecha', '>=', earliest)
      .groupBy('banco', 'month');

    const journalRows = await db('finance_journal')
      .select('banco')
      .select(db.raw("DATE_FORMAT(fecha, '%Y-%m') as month"))
      .select(db.raw('SUM(CASE WHEN monto >= 0 THEN monto ELSE 0 END) as ingreso'))
      .select(db.raw('SUM(CASE WHEN monto < 0 THEN -monto ELSE 0 END) as egreso'))
      .where('fecha', '>=', earliest)
      .where('moneda', 'soles')
      .groupBy('banco', 'month');

    const emptyGrid = () => Object.fromEntries(
      BANCOS.map((b) => [b, Object.fromEntries(monthKeys.map((m) => [m, 0]))])
    );
    const ingresos = emptyGrid();
    const egresos = emptyGrid();

    for (const r of incomeRows) {
      if (ingresos[r.banco]?.[r.month] !== undefined) {
        ingresos[r.banco][r.month] += Number(r.total) || 0;
      }
    }
    for (const r of journalRows) {
      if (ingresos[r.banco]?.[r.month] !== undefined) {
        ingresos[r.banco][r.month] += Number(r.ingreso) || 0;
      }
      if (egresos[r.banco]?.[r.month] !== undefined) {
        egresos[r.banco][r.month] += Number(r.egreso) || 0;
      }
    }

    const toSeries = (grid) => BANCOS.map((banco) => ({
      banco,
      values: monthKeys.map((m) => Math.round(grid[banco][m] * 100) / 100)
    }));
    const bankTotal = (grid, banco) => monthKeys.reduce((s, m) => s + grid[banco][m], 0);
    const grandTotal = (grid) => BANCOS.reduce((s, b) => s + bankTotal(grid, b), 0);

    const totalIngresos = Math.round(grandTotal(ingresos) * 100) / 100;
    const totalEgresos = Math.round(grandTotal(egresos) * 100) / 100;

    return {
      months: monthKeys,
      banks: BANCOS,
      ingresos: toSeries(ingresos),
      egresos: toSeries(egresos),
      totals: {
        ingresos: totalIngresos,
        egresos: totalEgresos,
        balance: Math.round((totalIngresos - totalEgresos) * 100) / 100,
        byBank: BANCOS.map((banco) => ({
          banco,
          ingresos: Math.round(bankTotal(ingresos, banco) * 100) / 100,
          egresos: Math.round(bankTotal(egresos, banco) * 100) / 100
        }))
      }
    };
  }
}
