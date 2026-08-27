import { db } from '../db/connection.js';

/**
 * Configuración (fila única) del motor conversacional de Avan: instrucciones
 * de tono/objetivo para el LLM y los valores por defecto que se aplican
 * cuando el lead no menciona su nivel, carrera o ámbito.
 */
export class WhatsappBotSettingsService {
  async get() {
    const row = await db('whatsapp_bot_settings').orderBy('id', 'asc').first();
    if (row) return row;

    // Salvaguarda por si la tabla quedó vacía (no debería pasar tras la
    // migración, que siembra la fila inicial).
    const [id] = await db('whatsapp_bot_settings').insert({});
    return db('whatsapp_bot_settings').where({ id }).first();
  }

  async update({
    toneInstructions,
    defaultAcademicLevel,
    defaultFieldOfStudy,
    defaultLocation,
    shortRepliesEnabled,
    typingIndicatorEnabled,
    messageGapSeconds
  }) {
    const current = await this.get();

    let gap = current.message_gap_seconds;
    if (messageGapSeconds !== undefined) {
      const parsed = Number(messageGapSeconds);
      gap = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 0), 60) : gap;
    }

    await db('whatsapp_bot_settings').where({ id: current.id }).update({
      tone_instructions: toneInstructions ?? current.tone_instructions,
      default_academic_level: defaultAcademicLevel || current.default_academic_level,
      default_field_of_study: defaultFieldOfStudy || current.default_field_of_study,
      default_location: defaultLocation || current.default_location,
      short_replies_enabled: shortRepliesEnabled === undefined ? current.short_replies_enabled : !!shortRepliesEnabled,
      typing_indicator_enabled: typingIndicatorEnabled === undefined ? current.typing_indicator_enabled : !!typingIndicatorEnabled,
      message_gap_seconds: gap,
      updated_at: db.fn.now()
    });
    return this.get();
  }
}
