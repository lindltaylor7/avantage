import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para las columnas (etapas) del Kanban de Leads.
 * Reemplaza el almacenamiento previo en localStorage del navegador.
 */
export class FunnelColumnService {
  async getAllColumns() {
    return db('funnel_columns').orderBy('position', 'asc');
  }

  async createColumn({ key, label, icon, color, final: isFinal }) {
    const maxPosition = await db('funnel_columns').max('position as max').first();
    const position = (maxPosition?.max ?? -1) + 1;

    await db('funnel_columns').insert({
      key,
      label,
      icon: icon || '📌',
      color: color || '#105EFF',
      final: Boolean(isFinal),
      position
    });
    return this.getColumnByKey(key);
  }

  async getColumnByKey(key) {
    return db('funnel_columns').where({ key }).first();
  }

  async updateColumn(key, { label, icon, color, final: isFinal }) {
    const updatePayload = {};
    if (label !== undefined) updatePayload.label = label;
    if (icon !== undefined) updatePayload.icon = icon;
    if (color !== undefined) updatePayload.color = color;
    if (isFinal !== undefined) updatePayload.final = Boolean(isFinal);

    if (Object.keys(updatePayload).length > 0) {
      await db('funnel_columns').where({ key }).update(updatePayload);
    }
    return this.getColumnByKey(key);
  }

  async deleteColumn(key) {
    return db('funnel_columns').where({ key }).del();
  }

  /**
   * Reordena las columnas según el arreglo de keys recibido (nuevo orden completo).
   */
  async reorderColumns(orderedKeys) {
    await Promise.all(
      orderedKeys.map((key, index) => db('funnel_columns').where({ key }).update({ position: index }))
    );
    return this.getAllColumns();
  }
}
