import { db } from '../db/connection.js';

const MAX_RECENT = 30;

/**
 * Notificaciones internas del panel (campana del navbar): reuniones que Avan
 * agendó, pagos verificados, proyectos nuevos, casos donde un lead con reunión
 * ya agendada necesita que un asesor intervenga, y —desde el 13/11/2026— los
 * avisos que el equipo se escribe a mano (ver `noticeService.js`).
 *
 * Esto es además **el punto único desde donde sale el push a la app móvil**:
 * `create()` asienta la fila y de paso la empuja por Firebase. Se cuelga acá y
 * no de cada llamador por la misma razón que el aviso de proyecto nuevo vive en
 * `projectService` y no en sus tres rutas de alta — hay ocho sitios que crean
 * notificaciones, y puesto en cada uno, el noveno que se agregue se olvida y
 * nadie se entera de que no avisó. El push **no espera ni puede fallar hacia
 * afuera**: la fila ya quedó asentada, que es lo que la campana necesita, y un
 * FCM lento o caído no puede demorar el cierre de una venta ni tumbar el
 * webhook del bot.
 *
 * **`user_id` en NULL significa "para todos"**, y es como nacen todas las
 * automáticas: son avisos del negocio, no de una persona a otra. Un aviso
 * dirigido lleva el id de SU destinatario, y uno mandado a tres personas son
 * tres filas —una por cada una— para que `is_read` siga significando lo que
 * significa: cada quien marca el suyo. Ver la cabecera de la migración
 * `20261204000000_alter_notifications_add_recipient.js`.
 */
export class NotificationService {
  constructor({ pushService = null } = {}) {
    this.pushService = pushService;
  }

  /**
   * Lo que esa persona puede ver: lo suyo más lo que es para todos.
   *
   * Está en un método y no copiado en las cuatro lecturas porque de él depende
   * que un aviso dirigido no se le muestre a quien no era — y una de las cuatro
   * que se olvide de filtrar es una fuga que no se ve mirando la pantalla.
   */
  #visibleTo(query, userId) {
    return query.where((builder) => builder.where({ user_id: userId }).orWhereNull('user_id'));
  }

  async create({ type, title, body, link, userId = null, createdBy = null, batchId = null }) {
    const [id] = await db('notifications').insert({
      type,
      title,
      body: body || null,
      link: link || null,
      user_id: userId,
      created_by: createdBy,
      batch_id: batchId
    });
    const notification = await db('notifications').where({ id }).first();
    // Dispara y se olvida: `sendForNotification` ya se traga su propio error.
    this.pushService?.sendForNotification(notification);
    return notification;
  }

  async getRecent({ userId, limit = MAX_RECENT } = {}) {
    const query = db('notifications').orderBy('created_at', 'desc').limit(limit);
    return userId ? this.#visibleTo(query, userId) : query;
  }

  async getUnreadCount({ userId } = {}) {
    const query = db('notifications').where({ is_read: false });
    const [{ count }] = await (userId ? this.#visibleTo(query, userId) : query).count('* as count');
    return Number(count);
  }

  /**
   * Marcar leída comprueba que la notificación **sea visible para quien la
   * marca**, y no solo que exista.
   *
   * Sin eso, cualquiera con sesión podría marcar leído el aviso dirigido a otra
   * persona probando ids — que es el mismo cuidado que `requireLeadVisible`
   * tiene con la ficha de un lead: filtrar la lista y dejar la fila abierta por
   * id es una cortina, no un permiso.
   */
  async markRead(id, { userId } = {}) {
    const query = db('notifications').where({ id });
    const afectadas = await (userId ? this.#visibleTo(query, userId) : query).update({ is_read: true });
    return afectadas > 0;
  }

  async markAllRead({ userId } = {}) {
    const query = db('notifications').where({ is_read: false });
    return (userId ? this.#visibleTo(query, userId) : query).update({ is_read: true });
  }
}
