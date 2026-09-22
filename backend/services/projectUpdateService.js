import { db } from '../db/connection.js';

/**
 * Columnas de la cuota que libera el entregable. Se leen con un LEFT JOIN
 * sobre la actualización para que el bloqueo se derive del estado real del
 * ingreso: nadie tiene que acordarse de "desbloquear" nada a mano cuando
 * Finanzas verifica el pago.
 */
const UNLOCK_COLUMNS = [
  'finance_income.code as unlock_code',
  'finance_income.cuota as unlock_cuota',
  'finance_income.monto as unlock_monto',
  'finance_income.estado as unlock_estado'
];

/**
 * Un adjunto queda bloqueado mientras la cuota a la que se ató no esté
 * verificada por Finanzas. Una actualización sin cuota asociada (todas las
 * anteriores a este flujo, y las que son solo texto) nunca se bloquea.
 */
function withLock(row) {
  if (!row) return row;
  return { ...row, is_locked: Boolean(row.income_id) && row.unlock_estado !== 'verificado' };
}

/**
 * Servicio de acceso a datos para los hitos/actualizaciones publicados en la
 * línea de tiempo de un proyecto (texto + adjunto opcional, que puede quedar
 * retenido hasta que se cobre la cuota correspondiente).
 */
export class ProjectUpdateService {
  async createUpdate({ projectId, authorId, content, attachment, incomeId }) {
    const [id] = await db('project_updates').insert({
      project_id: projectId,
      author_id: authorId || null,
      content,
      income_id: incomeId || null,
      attachment_filename: attachment?.filename || null,
      attachment_original_name: attachment?.originalname || null,
      attachment_mime_type: attachment?.mimetype || null,
      attachment_size: attachment?.size || null
    });
    return this.getUpdateById(id);
  }

  /** Cambia (o quita, con `null`) la cuota que libera el adjunto de un hito. */
  async setUnlockIncome(id, incomeId) {
    await db('project_updates').where({ id }).update({ income_id: incomeId || null });
    return this.getUpdateById(id);
  }

  async getUpdateById(id) {
    const row = await db('project_updates')
      .leftJoin('users', 'users.id', 'project_updates.author_id')
      .leftJoin('finance_income', 'finance_income.id', 'project_updates.income_id')
      .where('project_updates.id', id)
      .select('project_updates.*', 'users.name as author_name', ...UNLOCK_COLUMNS)
      .first();
    return withLock(row);
  }

  async getUpdatesByProject(projectId) {
    const rows = await db('project_updates')
      .leftJoin('users', 'users.id', 'project_updates.author_id')
      .leftJoin('finance_income', 'finance_income.id', 'project_updates.income_id')
      .where('project_updates.project_id', projectId)
      .select('project_updates.*', 'users.name as author_name', ...UNLOCK_COLUMNS)
      .orderBy('project_updates.created_at', 'desc');
    return rows.map(withLock);
  }
}
