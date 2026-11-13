import { db } from '../db/connection.js';

const MAX_RECENT = 30;

/**
 * Notificaciones internas del panel (campana del navbar): por ahora,
 * reuniones que Avan agendó, pagos verificados, proyectos nuevos y casos donde
 * un lead con reunión ya agendada necesita que un asesor intervenga.
 *
 * Desde el 13/11/2026 esto es además **el punto único desde donde sale el push
 * a la app móvil**: `create()` asienta la fila y de paso la empuja por Firebase
 * a los dispositivos registrados. Se cuelga acá y no de cada llamador por la
 * misma razón que el aviso de proyecto nuevo vive en `projectService` y no en
 * sus tres rutas de alta — hay ocho sitios que crean notificaciones hoy, y
 * puesto en cada uno, el noveno que se agregue se olvida y nadie se entera de
 * que no avisó.
 *
 * El push **no espera ni puede fallar hacia afuera**: la fila ya quedó
 * asentada, que es lo que la campana del panel necesita, y un FCM lento o
 * caído no puede demorar el cierre de una venta ni tumbar el webhook del bot.
 */
export class NotificationService {
  constructor({ pushService = null } = {}) {
    this.pushService = pushService;
  }

  async create({ type, title, body, link }) {
    const [id] = await db('notifications').insert({ type, title, body: body || null, link: link || null });
    const notification = await db('notifications').where({ id }).first();
    // Dispara y se olvida: `sendForNotification` ya se traga su propio error.
    this.pushService?.sendForNotification(notification);
    return notification;
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
