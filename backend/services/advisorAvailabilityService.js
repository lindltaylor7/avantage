import { db } from '../db/connection.js';

/**
 * Horario semanal recurrente de disponibilidad para reuniones, configurado
 * por cada usuario para sí mismo (bloques de media hora por día).
 */
export class AdvisorAvailabilityService {
  async getByUser(userId) {
    return db('advisor_availability')
      .select('day_of_week', 'start_time')
      .where({ user_id: userId })
      .orderBy(['day_of_week', 'start_time']);
  }

  /**
   * Reemplaza todo el horario del usuario por la lista de bloques recibida
   * (guardado tipo "foto completa", más simple y predecible que un diff
   * incremental para una grilla que el usuario pinta libremente).
   */
  async replaceForUser(userId, slots) {
    const rows = (slots || [])
      .filter((slot) => Number.isInteger(slot.dayOfWeek) && slot.dayOfWeek >= 0 && slot.dayOfWeek <= 6 && /^\d{2}:\d{2}$/.test(slot.startTime))
      .map((slot) => ({ user_id: userId, day_of_week: slot.dayOfWeek, start_time: slot.startTime }));

    await db.transaction(async (trx) => {
      await trx('advisor_availability').where({ user_id: userId }).del();
      if (rows.length > 0) {
        await trx('advisor_availability').insert(rows);
      }
    });

    return this.getByUser(userId);
  }
}
