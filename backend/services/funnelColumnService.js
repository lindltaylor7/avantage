import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para las columnas (etapas) del Kanban de Leads.
 * Reemplaza el almacenamiento previo en localStorage del navegador.
 */
export class FunnelColumnService {
  async getAllColumns() {
    return db('funnel_columns').orderBy('position', 'asc');
  }

  async createColumn({ key, label, icon, color, final: isFinal, quoted: isQuoted }) {
    const maxPosition = await db('funnel_columns').max('position as max').first();
    const position = (maxPosition?.max ?? -1) + 1;

    await db('funnel_columns').insert({
      key,
      label,
      icon: icon || '📌',
      color: color || '#105EFF',
      final: Boolean(isFinal),
      quoted: Boolean(isQuoted),
      position
    });
    if (isQuoted) await this._makeQuotedExclusive(key);
    return this.getColumnByKey(key);
  }

  /**
   * Solo una columna puede ser la etapa de cotización: al marcar una, se
   * desmarca cualquier otra. Sin esto, "¿a cuál de las dos muevo el lead?"
   * no tendría respuesta y el destino dependería del orden de la consulta.
   */
  async _makeQuotedExclusive(key) {
    await db('funnel_columns').whereNot({ key }).update({ quoted: false });
  }

  /** La columna marcada como etapa de cotización, o null si no hay ninguna. */
  async getQuotedColumn() {
    return (await db('funnel_columns').where({ quoted: true }).first()) || null;
  }

  async getColumnByKey(key) {
    return db('funnel_columns').where({ key }).first();
  }

  async updateColumn(key, { label, icon, color, final: isFinal, quoted: isQuoted }) {
    const updatePayload = {};
    if (label !== undefined) updatePayload.label = label;
    if (icon !== undefined) updatePayload.icon = icon;
    if (color !== undefined) updatePayload.color = color;
    if (isFinal !== undefined) updatePayload.final = Boolean(isFinal);
    if (isQuoted !== undefined) updatePayload.quoted = Boolean(isQuoted);

    if (Object.keys(updatePayload).length > 0) {
      await db('funnel_columns').where({ key }).update(updatePayload);
    }
    if (isQuoted) await this._makeQuotedExclusive(key);
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
