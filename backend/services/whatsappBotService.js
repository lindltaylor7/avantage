import { randomUUID } from 'crypto';
import { db } from '../db/connection.js';
import { WhatsappBotSettingsService } from './whatsappBotSettingsService.js';

const MAX_ACTIVITY_LOG = 100;

// Rango de espera antes de cada mensaje automático (simula el tiempo de
// "escribiendo..." de una persona real y evita ráfagas de mensajes
// instantáneos que WhatsApp puede marcar como comportamiento de spam/bot,
// afectando la calidad del número o llevando a su restricción.
const BOT_DELAY_MIN_MS = Number(process.env.WHATSAPP_BOT_DELAY_MIN_MS) || 1500;
const BOT_DELAY_MAX_MS = Number(process.env.WHATSAPP_BOT_DELAY_MAX_MS) || 3500;

// Asesor cuyo Google Calendar usa el bot para agendar las llamadas que
// ofrece al terminar de calificar el tema (por ahora uno solo, fijo, en vez
// de resolver dinámicamente a partir de "assigned_to" del lead).
const BOOKING_ADVISOR_USER_ID = Number(process.env.GOOGLE_BOOKING_ADVISOR_USER_ID) || 1;

// Los mensajes de un contacto suelen llegar en varias burbujas seguidas
// (p. ej. "Hola" y luego, unos segundos después, el tema real). En vez de
// mandarle cada burbuja al LLM por separado, se espera este tiempo de
// silencio para juntar todo en un solo mensaje antes de procesar el turno.
const MESSAGE_DEBOUNCE_MS = Number(process.env.WHATSAPP_BOT_FIRST_MESSAGE_DEBOUNCE_MS) || 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return BOT_DELAY_MIN_MS + Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS);
}

function numberedList(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Motor conversacional de Avan por WhatsApp: en cada turno, un LLM (Ollama
 * Cloud) decide qué responder y qué preguntar de forma natural, extrayendo
 * del hilo los datos necesarios para evaluar la tesis (tema, ámbito, nivel,
 * carrera, correo). Al reunir tema + correo, evalúa la viabilidad, envía el
 * reporte por correo, registra/actualiza el lead en el funnel de ventas, y
 * ofrece agendar una llamada en el calendario real del asesor.
 */
export class WhatsappBotService {
  constructor({ ollamaService, emailService, leadService, whatsappMessageService, settingsService, googleCalendarService }) {
    this.ollamaService = ollamaService;
    this.emailService = emailService;
    this.leadService = leadService;
    this.whatsappMessageService = whatsappMessageService;
    this.settingsService = settingsService || new WhatsappBotSettingsService();
    this.googleCalendarService = googleCalendarService;
    // wa_id -> { messages: string[], timer: NodeJS.Timeout }, buffer temporal
    // de las burbujas de un contacto mientras se espera el silencio de
    // MESSAGE_DEBOUNCE_MS antes de procesar el turno conversacional.
    this.pendingMessages = new Map();
    // Bitácora en memoria (más reciente primero) de lo que hace el bot: cuándo
    // agrupa mensajes, qué le manda al LLM de Ollama Cloud, qué responde, y si
    // el envío por WhatsApp tuvo éxito. Sirve para verificar visualmente desde
    // el panel de WhatsApp que el flujo está funcionando, sin depender de los
    // logs del servidor.
    this.activity = [];
  }

  logActivity(entry) {
    this.activity.unshift({ id: randomUUID(), at: new Date().toISOString(), ...entry });
    if (this.activity.length > MAX_ACTIVITY_LOG) this.activity.length = MAX_ACTIVITY_LOG;
  }

  getActivity() {
    return this.activity;
  }

  clearActivity() {
    this.activity = [];
  }

  async getSession(waId) {
    return db('whatsapp_bot_sessions').where({ wa_id: waId }).first();
  }

  async updateSession(waId, data) {
    await db('whatsapp_bot_sessions').where({ wa_id: waId }).update({ ...data, updated_at: db.fn.now() });
  }

  /**
   * Borra la sesión de un contacto para que su próximo mensaje se trate como
   * si fuera un contacto totalmente nuevo (pasa de nuevo por el buffer y el
   * saludo generado por el LLM). Útil para volver a probar la conversación
   * con un número que ya la completó o quedó pausado, sin tener que esperar
   * a un contacto nuevo. No borra el historial de mensajes visible en el
   * hilo, solo el estado interno del bot.
   */
  async resetSession(waId) {
    const pending = this.pendingMessages.get(waId);
    if (pending?.timer) clearTimeout(pending.timer);
    this.pendingMessages.delete(waId);

    await db('whatsapp_bot_sessions').where({ wa_id: waId }).delete();
    this.logActivity({ type: 'reset', waId });
  }

  async setBotEnabled(waId, enabled) {
    const existing = await this.getSession(waId);
    if (existing) {
      await this.updateSession(waId, { bot_enabled: enabled });
    } else {
      await db('whatsapp_bot_sessions').insert({ wa_id: waId, status: 'active', bot_enabled: enabled, answers: JSON.stringify({}) });
    }
  }

  /**
   * Mueve al lead de este contacto a una etapa del Setter Funnel. El lead ya
   * existe siempre en este punto (whatsappWebhookService lo crea/encuentra
   * por teléfono antes de pasarle el mensaje al bot), así que solo se
   * actualiza su status; si por algún motivo no existe, se ignora en vez de
   * interrumpir la conversación.
   */
  async moveFunnelStage(waId, status) {
    try {
      const lead = await this.leadService.findByPhone(waId);
      if (!lead) return;
      await this.leadService.updateLeadStatus(lead.id, status);
    } catch (error) {
      console.error(`❌ [WhatsApp Bot] Error al mover el lead de ${waId} a la etapa "${status}" del Setter Funnel:`, error);
    }
  }

  async send(waId, text) {
    await sleep(randomDelay());
    try {
      await this.whatsappMessageService.sendTextMessage(waId, text);
      this.logActivity({ type: 'send_success', waId, text });
    } catch (error) {
      this.logActivity({ type: 'send_failed', waId, text, error: error.message });
      throw error;
    }
  }

  /**
   * Procesa un mensaje de texto entrante. Los turnos de conversación libre
   * (estado "active", incluyendo el primer contacto) se agrupan en el buffer
   * de silencio antes de mandarlos al LLM; la selección de horario tras
   * ofrecer agendar se procesa aparte, sin debounce.
   */
  async handleIncomingMessage(waId, text) {
    // Si ya hay un buffer en curso para este wa_id, esta burbuja se suma a
    // las anteriores y se reinicia la espera de silencio, en vez de procesar
    // un turno por cada mensaje suelto.
    if (this.pendingMessages.has(waId)) {
      this.bufferMessage(waId, text);
      return;
    }

    const session = await this.getSession(waId);

    if (!session) {
      this.bufferMessage(waId, text);
      return;
    }

    if (!session.bot_enabled || session.status === 'completed') {
      this.logActivity({
        type: 'skipped',
        waId,
        text,
        reason: session.status === 'completed'
          ? 'La conversación ya está marcada como "completed" (terminó el flujo antes); el bot no vuelve a responder automáticamente. Usa "🔄 Reiniciar conversación" en el panel para probarla de nuevo.'
          : 'El bot está pausado para este contacto (alguien respondió manualmente). Actívalo con "▶️ Activar bot" en el panel.'
      });
      return;
    }

    if (session.status === 'scheduling') {
      await this.handleSchedulingReply(waId, session, text);
      return;
    }

    // status === 'active': se agrupa antes de procesar el turno.
    this.bufferMessage(waId, text);
  }

  /**
   * Agrega una burbuja al buffer de este wa_id y reinicia el temporizador de
   * silencio. Cuando el contacto deja de escribir por MESSAGE_DEBOUNCE_MS,
   * se dispara runConversationTurn() con todo lo acumulado unido en un solo
   * mensaje.
   */
  bufferMessage(waId, text) {
    const pending = this.pendingMessages.get(waId) || { messages: [], timer: null };
    if (text && text.trim()) pending.messages.push(text.trim());

    this.logActivity({
      type: 'buffer',
      waId,
      text,
      bufferSize: pending.messages.length,
      waitMs: MESSAGE_DEBOUNCE_MS
    });

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this.pendingMessages.delete(waId);
      this.runConversationTurn(waId, pending.messages.join('\n')).catch((error) => {
        this.logActivity({ type: 'conversation_turn_failed', waId, error: error.message });
        console.error(`❌ [WhatsApp Bot] Error en el turno de conversación con ${waId}:`, error);
      });
    }, MESSAGE_DEBOUNCE_MS);

    this.pendingMessages.set(waId, pending);
  }

  /**
   * Ejecuta un turno del motor conversacional: arma el contexto (respuestas
   * ya conocidas + hilo de mensajes reales de WhatsApp), le pide al LLM la
   * siguiente respuesta natural y los datos que pudo extraer, los guarda, y
   * si ya reunió lo mínimo (tema + correo) pasa a evaluar y ofrecer agendar.
   */
  async runConversationTurn(waId, incomingText) {
    let session = await this.getSession(waId);
    const isFirstTurn = !session;

    if (!session) {
      await db('whatsapp_bot_sessions').insert({ wa_id: waId, status: 'active', bot_enabled: true, answers: JSON.stringify({}) });
      // El contacto pasa de "Conversación Abierta" a "En Calificación" en el
      // Setter Funnel apenas Avan arranca la conversación con él.
      await this.moveFunnelStage(waId, 'calificando');
      session = await this.getSession(waId);
    }

    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    const settings = await this.settingsService.get();
    const thread = await this.whatsappMessageService.getThread(waId, { limit: 40 });
    const history = thread
      .filter((m) => m.body && m.body.trim())
      .map((m) => ({ direction: m.direction, text: m.body }));

    this.logActivity({
      type: 'llm_request',
      waId,
      prompt: incomingText,
      model: this.ollamaService.chatModel,
      host: this.ollamaService.host
    });
    const startedAt = Date.now();
    const result = await this.ollamaService.converseAsAvan({
      history,
      knownAnswers: answers,
      incomingText,
      isFirstTurn,
      toneInstructions: settings.tone_instructions
    });
    this.logActivity({
      type: 'llm_response',
      waId,
      text: result.reply,
      source: result.source,
      latencyMs: Date.now() - startedAt
    });

    const extracted = result.extracted || {};
    if (extracted.problem) answers.problem = extracted.problem;
    if (extracted.location) answers.location = extracted.location;
    if (extracted.level) answers.level = extracted.level;
    if (extracted.field) answers.field = extracted.field;
    if (extracted.email && extracted.email.includes('@')) answers.email = extracted.email;

    await this.updateSession(waId, { answers: JSON.stringify(answers) });
    await this.send(waId, result.reply);

    const hasMinimum = !!(answers.problem && answers.email);
    if (result.ready && hasMinimum) {
      await this.finalize(waId, answers);
    }
  }

  /**
   * Evalúa la viabilidad con IA, envía el reporte por correo (si se recogió
   * uno) y crea/actualiza el lead correspondiente en el funnel de ventas.
   * El ámbito, nivel y carrera usan el valor por defecto configurado en
   * `whatsapp_bot_settings` si el LLM no logró identificarlos en la
   * conversación, para que el reporte y el lead siempre queden completos.
   */
  async finalize(waId, answers) {
    const settings = await this.settingsService.get();

    const problem = answers.problem || 'Tema de tesis por definir';
    const location = answers.location || settings.default_location || 'Perú';
    const level = answers.level || settings.default_academic_level || 'Pregrado (Bachiller/Título)';
    const field = answers.field || settings.default_field_of_study || 'Ingeniería de Sistemas y Computación';
    const email = answers.email || '';

    const synthesizedTopic = `${problem}: Caso de estudio y propuesta en ${location}`;
    const additionalNotes = `Problema: ${problem} | Ámbito: ${location} | Origen: WhatsApp (Avan, bot automático)`;

    await this.send(
      waId,
      `🎉 ¡Perfecto! He formulado tu propuesta:\n\n📜 "${synthesizedTopic}"\n\n🎓 Nivel: ${level}\n🏛️ Carrera: ${field}\n` +
      (email ? `📩 Te enviaré el reporte completo a: ${email}\n\n` : '\n') +
      '🧠 Estoy evaluando la viabilidad con IA, dame un momento...'
    );

    try {
      const reportData = await this.ollamaService.evaluateThesisViability({
        topic: synthesizedTopic,
        academicLevel: level,
        fieldOfStudy: field,
        additionalNotes
      });

      if (email) {
        const emailStatus = await this.emailService.sendReportEmail(email, reportData);
        if (!emailStatus.success) {
          console.warn(`⚠️ [WhatsApp Bot] El correo a ${email} no se pudo confirmar como enviado.`);
        }
      }

      const evaluation = reportData.evaluation;
      const leadPayload = {
        topic: synthesizedTopic,
        academicLevel: level,
        fieldOfStudy: field,
        email,
        additionalNotes,
        overallViabilityScore: evaluation.overallViabilityScore,
        viabilityLevel: evaluation.viabilityLevel,
        source: 'WhatsApp Directo',
        // Avan ya terminó de calificarlo y le mandó su reporte; en el Setter
        // Funnel pasa a "Transferido a Closer" para que un asesor le dé
        // seguimiento humano.
        status: 'transferido_closer'
      };

      const existingLead = await this.leadService.findByPhone(waId);
      if (existingLead) {
        await this.leadService.updateLead(existingLead.id, leadPayload);
      } else {
        await this.leadService.createLead({ ...leadPayload, phone: waId });
      }

      await this.send(
        waId,
        `✅ ¡Listo! Resultado de tu evaluación:\n\n📊 Viabilidad: ${evaluation.overallViabilityScore}% (${evaluation.viabilityLevel})\n\n` +
        (email
          ? `📩 Revisa tu correo (${email}) para ver el reporte completo con normativas SUNEDU/CONCYTEC.\n\n`
          : '')
      );

      await this.offerScheduling(waId, { topic: synthesizedTopic, email });
    } catch (error) {
      console.error('❌ [WhatsApp Bot] Error al finalizar la evaluación:', error);
      await this.updateSession(waId, { status: 'completed' });
      await this.send(waId, '⚠️ Tuvimos un problema técnico al generar tu reporte automático, pero ya registramos tus datos. Un asesor te contactará pronto para continuar. ¡Gracias! 🙌');
    }
  }

  /**
   * Tras finalizar la evaluación, ofrece agendar directamente una llamada en
   * el Google Calendar real del asesor (`BOOKING_ADVISOR_USER_ID`), mostrando
   * sus próximos bloques libres reales (cruzando su horario configurado con
   * lo que ya tiene ocupado en su calendario). Si el asesor no tiene Google
   * Calendar conectado o no le quedan bloques libres, se cae de vuelta al
   * cierre manual de siempre sin bloquear la conversación.
   */
  async offerScheduling(waId, { topic, email }) {
    try {
      if (!this.googleCalendarService?.isConfigured()) throw new Error('Google Calendar no configurado en el servidor');

      const connection = await this.googleCalendarService.getConnection(BOOKING_ADVISOR_USER_ID);
      if (!connection) throw new Error('El asesor por defecto no tiene Google Calendar conectado');

      const slots = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID);
      if (slots.length === 0) throw new Error('Sin bloques libres próximos');

      const session = await this.getSession(waId);
      const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
      answers.__scheduling = { slots, topic, email };
      await this.updateSession(waId, { status: 'scheduling', answers: JSON.stringify(answers) });

      const list = numberedList(slots.map((s) => s.label));
      await this.send(
        waId,
        `📅 Para terminar, ¿quieres agendar una llamada gratuita con un asesor? Responde con el número del horario que prefieras, o escribe "no" si prefieres que te contacten después:\n\n${list}`
      );
    } catch (error) {
      this.logActivity({ type: 'scheduling_offer_skipped', waId, reason: error.message });
      await this.updateSession(waId, { status: 'completed' });
      await this.send(waId, 'Un asesor se pondrá en contacto contigo pronto para coordinar una llamada. ¡Gracias! 🙌');
    }
  }

  /**
   * Procesa la respuesta del lead a los horarios ofrecidos por
   * offerScheduling(): un número válido crea el evento real en Google
   * Calendar (con link de Meet); "no" cierra el flujo sin agendar.
   */
  async handleSchedulingReply(waId, session, text) {
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    const scheduling = answers.__scheduling;

    if (!scheduling) {
      await this.updateSession(waId, { status: 'completed' });
      return;
    }

    const trimmed = (text || '').trim();
    if (['no', 'omitir', 'despues', 'después'].includes(normalize(trimmed))) {
      delete answers.__scheduling;
      await this.updateSession(waId, { status: 'completed', answers: JSON.stringify(answers) });
      await this.send(waId, 'Sin problema, un asesor se pondrá en contacto contigo pronto. ¡Gracias! 🙌');
      return;
    }

    const index = parseInt(trimmed, 10);
    const slot = Number.isInteger(index) ? scheduling.slots[index - 1] : null;
    if (!slot) {
      await this.send(
        waId,
        `⚠️ No reconocí esa opción. Responde con el número del horario, o "no" si prefieres que te contacten después:\n\n${numberedList(scheduling.slots.map((s) => s.label))}`
      );
      return;
    }

    try {
      const event = await this.googleCalendarService.createMeetEvent(BOOKING_ADVISOR_USER_ID, {
        summary: `Asesoría de tesis - ${scheduling.topic}`,
        description: `Llamada agendada automáticamente por Avan (WhatsApp) con el contacto ${waId}.`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        attendeeEmail: scheduling.email || undefined
      });

      delete answers.__scheduling;
      await this.updateSession(waId, { status: 'completed', answers: JSON.stringify(answers) });

      const lead = await this.leadService.findByPhone(waId);
      if (lead) {
        const noteAppend = `\nReunión agendada: ${slot.label}${event.meetLink ? ` — ${event.meetLink}` : ''}`;
        await this.leadService.updateLead(lead.id, { additionalNotes: `${lead.additional_notes || ''}${noteAppend}` });
      }

      await this.send(
        waId,
        `✅ ¡Listo! Tu llamada quedó agendada para *${slot.label}*.` +
        (event.meetLink ? `\n\n🔗 Link de Google Meet: ${event.meetLink}` : '') +
        '\n\nTe esperamos. ¡Gracias! 🙌'
      );
    } catch (error) {
      console.error(`❌ [WhatsApp Bot] Error al agendar la reunión para ${waId}:`, error);
      delete answers.__scheduling;
      await this.updateSession(waId, { status: 'completed', answers: JSON.stringify(answers) });
      await this.send(waId, '⚠️ Tuvimos un problema técnico al agendar la reunión. Un asesor se pondrá en contacto contigo directamente para coordinar. ¡Gracias! 🙌');
    }
  }
}
