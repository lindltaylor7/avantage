import { db } from '../db/connection.js';

/**
 * Registro propio de las reuniones que Avan agenda automáticamente (además
 * del evento real que ya vive en Google Calendar), para poder listarlas
 * dentro del panel de Avantage sin depender de una consulta en vivo a la API
 * de Google.
 */
export class ScheduledMeetingService {
  async create({ leadId, waId, advisorUserId, topic, startTime, endTime, meetLink, calendarEventId }) {
    const [id] = await db('scheduled_meetings').insert({
      lead_id: leadId ?? null,
      wa_id: waId,
      advisor_user_id: advisorUserId,
      topic: topic || null,
      start_time: new Date(startTime),
      end_time: new Date(endTime),
      meet_link: meetLink || null,
      calendar_event_id: calendarEventId || null
    });
    return db('scheduled_meetings').where({ id }).first();
  }

  /**
   * Próximas reuniones (desde ahora en adelante), con nombre/teléfono del
   * lead asociado cuando existe.
   */
  async getUpcoming({ limit = 50 } = {}) {
    return db('scheduled_meetings')
      .leftJoin('leads', 'leads.id', 'scheduled_meetings.lead_id')
      .select(
        'scheduled_meetings.*',
        'leads.full_name as lead_full_name',
        'leads.email as lead_email',
        'leads.topic as lead_topic'
      )
      .where('scheduled_meetings.start_time', '>=', db.fn.now())
      .orderBy('scheduled_meetings.start_time', 'asc')
      .limit(limit);
  }

  /**
   * La reunión más reciente agendada con este contacto — se usa para
   * responderle con los datos reales (fecha/link) si pregunta por su
   * reunión después de que ya quedó agendada.
   */
  async getLatestForContact(waId) {
    return db('scheduled_meetings').where({ wa_id: waId }).orderBy('created_at', 'desc').first();
  }
}
