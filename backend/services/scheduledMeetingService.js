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
   * Reuniones que ya toca recordarle al contacto: empiezan dentro de las
   * próximas `leadMs` (pero todavía no empezaron) y aún no tienen
   * recordatorio. `minAgeMs` deja fuera las que se acaban de agendar: si
   * alguien reserva para dentro de dos horas y diez minutos, mandarle un
   * "te recuerdo tu reunión" a los cinco minutos de confirmarla sobra.
   */
  async getPendingReminders({ leadMs, minAgeMs = 0 } = {}) {
    const now = Date.now();
    return db('scheduled_meetings')
      .leftJoin('leads', 'leads.id', 'scheduled_meetings.lead_id')
      .select('scheduled_meetings.*', 'leads.full_name as lead_full_name')
      .whereNull('scheduled_meetings.reminder_sent_at')
      .where('scheduled_meetings.start_time', '>', new Date(now))
      .where('scheduled_meetings.start_time', '<=', new Date(now + leadMs))
      .where('scheduled_meetings.created_at', '<=', new Date(now - minAgeMs))
      .orderBy('scheduled_meetings.start_time', 'asc');
  }

  /** Marca el recordatorio como enviado (o como intentado, si falló el envío). */
  async markReminderSent(id) {
    return db('scheduled_meetings').where({ id }).update({ reminder_sent_at: db.fn.now() });
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
