import { db } from '../db/connection.js';
import { BOT_PROMPT_DEFAULTS, parsePromptRules } from './whatsappBotPromptDefaults.js';

// Topes defensivos para los textos editables del prompt (evitan que un pegado
// accidental infle el prompt del LLM o el tamaño de la fila).
const MAX_TEXT_LEN = 2000;
const MAX_RULE_LEN = 500;
const MAX_RULES = 40;

function clampText(value, max = MAX_TEXT_LEN) {
  const trimmed = String(value ?? '').trim();
  return trimmed.slice(0, max);
}

function sanitizeRules(rules) {
  if (!Array.isArray(rules)) return null;
  return rules
    .filter((r) => typeof r === 'string')
    .map((r) => r.trim().slice(0, MAX_RULE_LEN))
    .filter(Boolean)
    .slice(0, MAX_RULES);
}

/**
 * Configuración (fila única) del motor conversacional de Avan: bloques
 * editables de su personalidad (identidad, objetivo, reglas del equipo),
 * instrucciones de tono adicionales, controles de comportamiento y los
 * valores por defecto que se aplican cuando el lead no menciona su nivel,
 * carrera o ámbito.
 */
export class WhatsappBotSettingsService {
  async get() {
    let row = await db('whatsapp_bot_settings').orderBy('id', 'asc').first();

    // Salvaguarda por si la tabla quedó vacía (no debería pasar tras la
    // migración, que siembra la fila inicial).
    if (!row) {
      const [id] = await db('whatsapp_bot_settings').insert({});
      row = await db('whatsapp_bot_settings').where({ id }).first();
    }

    // `prompt_rules` se guarda como texto JSON; se devuelve ya como array para
    // que el panel y el motor conversacional no tengan que parsearlo.
    return { ...row, prompt_rules: parsePromptRules(row.prompt_rules) };
  }

  /** Textos por defecto de la personalidad (para el botón "Restaurar" del panel). */
  getPromptDefaults() {
    return {
      identity: BOT_PROMPT_DEFAULTS.identity,
      objective: BOT_PROMPT_DEFAULTS.objective,
      rules: [...BOT_PROMPT_DEFAULTS.rules]
    };
  }

  async update({
    toneInstructions,
    botIdentity,
    botObjective,
    promptRules,
    defaultAcademicLevel,
    defaultFieldOfStudy,
    defaultLocation,
    shortRepliesEnabled,
    typingIndicatorEnabled,
    messageGapSeconds
  }) {
    const current = await db('whatsapp_bot_settings').orderBy('id', 'asc').first();

    let gap = current.message_gap_seconds;
    if (messageGapSeconds !== undefined) {
      const parsed = Number(messageGapSeconds);
      gap = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 0), 60) : gap;
    }

    const sanitizedRules = promptRules === undefined ? undefined : sanitizeRules(promptRules);

    await db('whatsapp_bot_settings').where({ id: current.id }).update({
      tone_instructions: toneInstructions ?? current.tone_instructions,
      // Los bloques de personalidad se guardan null cuando quedan vacíos: el
      // motor conversacional cae al texto por defecto en ese caso.
      bot_identity: botIdentity === undefined ? current.bot_identity : (clampText(botIdentity) || null),
      bot_objective: botObjective === undefined ? current.bot_objective : (clampText(botObjective) || null),
      prompt_rules: sanitizedRules === undefined
        ? current.prompt_rules
        : (sanitizedRules && sanitizedRules.length ? JSON.stringify(sanitizedRules) : null),
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
