import { db } from '../db/connection.js';

const VALID_TYPES = ['ingreso', 'egreso'];

/**
 * Registro de ingresos y egresos del negocio (matrículas, publicidad,
 * servicios, sueldos, etc.), con resúmenes para el panel de Finanzas.
 */
export class FinanceService {
  async list({ type, category, from, to, limit = 100 } = {}) {
    let query = db('finance_transactions')
      .leftJoin('projects', 'projects.id', 'finance_transactions.project_id')
      .leftJoin('users', 'users.id', 'finance_transactions.created_by')
      .select(
        'finance_transactions.*',
        'projects.topic as project_topic',
        'users.name as created_by_name'
      )
      .orderBy('finance_transactions.transaction_date', 'desc')
      .orderBy('finance_transactions.id', 'desc')
      .limit(limit);

    if (type && VALID_TYPES.includes(type)) query = query.where('finance_transactions.type', type);
    if (category) query = query.where('finance_transactions.category', category);
    if (from) query = query.where('finance_transactions.transaction_date', '>=', from);
    if (to) query = query.where('finance_transactions.transaction_date', '<=', to);

    return query;
  }

  async create({ type, category, description, amount, transactionDate, projectId, createdBy }) {
    if (!VALID_TYPES.includes(type)) {
      throw new Error('El tipo debe ser "ingreso" o "egreso".');
    }
    if (!category || !category.trim()) {
      throw new Error('La categoría es obligatoria.');
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('El monto debe ser un número mayor a 0.');
    }
    if (!transactionDate) {
      throw new Error('La fecha es obligatoria.');
    }

    const [id] = await db('finance_transactions').insert({
      type,
      category: category.trim(),
      description: description?.trim() || null,
      amount: numericAmount,
      transaction_date: transactionDate,
      project_id: projectId || null,
      created_by: createdBy || null
    });

    return this.getById(id);
  }

  async getById(id) {
    return db('finance_transactions')
      .leftJoin('projects', 'projects.id', 'finance_transactions.project_id')
      .leftJoin('users', 'users.id', 'finance_transactions.created_by')
      .select(
        'finance_transactions.*',
        'projects.topic as project_topic',
        'users.name as created_by_name'
      )
      .where('finance_transactions.id', id)
      .first();
  }

  async delete(id) {
    return db('finance_transactions').where({ id }).del();
  }

  /**
   * Totales, balance, desglose por categoría, y serie mensual (últimos 6
   * meses) de ingresos vs. egresos — todo lo que necesita el panel para sus
   * KPIs y gráficos.
   */
  async getSummary() {
    const totalsRaw = await db('finance_transactions')
      .select('type')
      .sum('amount as total')
      .groupBy('type');

    const totals = { ingreso: 0, egreso: 0 };
    for (const row of totalsRaw) {
      totals[row.type] = Number(row.total) || 0;
    }
    const balance = totals.ingreso - totals.egreso;

    const byCategoryRaw = await db('finance_transactions')
      .select('type', 'category')
      .sum('amount as total')
      .groupBy('type', 'category')
      .orderBy('total', 'desc');

    const byCategory = byCategoryRaw.map((row) => ({
      type: row.type,
      category: row.category,
      total: Number(row.total) || 0
    }));

    // Serie mensual de los últimos 6 meses (incluye el actual), en orden cronológico.
    const monthsBack = 6;
    const now = new Date();
    const monthKeys = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const earliestDate = `${monthKeys[0]}-01`;

    const monthlyRaw = await db('finance_transactions')
      .select('type')
      .select(db.raw("DATE_FORMAT(transaction_date, '%Y-%m') as month"))
      .sum('amount as total')
      .where('transaction_date', '>=', earliestDate)
      .groupBy('type', 'month');

    const monthlyMap = new Map(monthKeys.map((m) => [m, { month: m, ingreso: 0, egreso: 0 }]));
    for (const row of monthlyRaw) {
      const bucket = monthlyMap.get(row.month);
      if (bucket) bucket[row.type] = Number(row.total) || 0;
    }

    return {
      totals: { ...totals, balance },
      byCategory,
      monthly: [...monthlyMap.values()]
    };
  }
}
