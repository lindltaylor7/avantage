import { db } from '../db/connection.js';

const MAX_RECENT = 30;

/**
 * Notificaciones internas del panel (campana del navbar): por ahora,
 * reuniones que Avan agendó y casos donde un lead con reunión ya agendada
 * necesita que un asesor intervenga manualmente.
 */
export class NotificationService {
  async create({ type, title, body, link }) {
    const [id] = await db('notifications').insert({ type, title, body: body || null, link: link || null });
    return db('notifications').where({ id }).first();
  }

  async getRecent({ limit = MAX_RECENT } = {}) {
    return db('notifications').orderBy('created_at', 'desc').limit(limit);
  }

  async getUnreadCount() {
    const [{ count }] = await db('notifications').where({ is_read: false }).count('* as count');
    return Number(count);
  }

  async markRead(id) {
    await db('notifications').where({ id }).update({ is_read: true });
  }

  async markAllRead() {
    await db('notifications').where({ is_read: false }).update({ is_read: true });
  }
}
