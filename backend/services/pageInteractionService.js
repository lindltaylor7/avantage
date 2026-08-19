import { db } from '../db/connection.js';

/**
 * Persistencia de las interacciones (comentarios, reacciones, publicaciones,
 * compartidos) recibidas del campo "feed" del webhook de Meta.
 */
export class PageInteractionService {
  async createFromFeedChange(pageId, value) {
    const [id] = await db('page_interactions').insert({
      page_id: pageId || value.from?.id || null,
      item_type: value.item || 'desconocido',
      verb: value.verb || null,
      post_id: value.post_id || null,
      comment_id: value.comment_id || null,
      sender_id: value.from?.id || null,
      sender_name: value.from?.name || null,
      message: value.message || null,
      reaction_type: value.reaction_type || null,
      raw_value: JSON.stringify(value),
      event_time: value.created_time ? new Date(value.created_time * 1000) : null
    });
    return this.getById(id);
  }

  async getById(id) {
    return db('page_interactions').where({ id }).first();
  }

  async getRecent({ limit = 50, itemType = null } = {}) {
    const query = db('page_interactions').orderBy('received_at', 'desc').limit(limit);
    if (itemType) query.where('item_type', itemType);
    return query;
  }

  async getStats() {
    const rows = await db('page_interactions')
      .select('item_type')
      .count('* as total')
      .groupBy('item_type');

    const stats = { total: 0, byType: {} };
    for (const row of rows) {
      const count = Number(row.total);
      stats.byType[row.item_type] = count;
      stats.total += count;
    }
    return stats;
  }
}
