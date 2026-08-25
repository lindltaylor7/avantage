import { randomUUID } from 'crypto';
import { db } from '../db/connection.js';
import { WhatsappBotStepService } from './whatsappBotStepService.js';

const MAX_ACTIVITY_LOG = 100;

// Rango de espera antes de cada mensaje automático (simula el tiempo de
// "escribiendo..." de una persona real y evita ráfagas de mensajes
// instantáneos que WhatsApp puede marcar como comportamiento de spam/bot,
// afectando la calidad del número o llevando a su restricción.
const BOT_DELAY_MIN_MS = Number(process.env.WHATSAPP_BOT_DELAY_MIN_MS) || 1500;
const BOT_DELAY_MAX_MS = Number(process.env.WHATSAPP_BOT_DELAY_MAX_MS) || 3500;

// Orden usado si una sesión antigua no tiene "step_sequence" guardado
// (creada antes de que el guion fuera configurable).
const LEGACY_STEP_ORDER = ['problem', 'location', 'level', 'field', 'email'];

// Asesor cuyo Google Calendar usa el bot para agendar las llamadas que
// ofrece al terminar el guion (por ahora uno solo, fijo, en vez de resolver
// dinámicamente a partir de "assigned_to" del lead).
const BOOKING_ADVISOR_USER_ID = Number(process.env.GOOGLE_BOOKING_ADVISOR_USER_ID) || 1;

// Cuando un contacto nuevo escribe, suele hacerlo en varias burbujas seguidas
// (p. ej. "Hola" y luego, unos segundos después, el tema real). En vez de
// responder a la primera burbuja al instante, se espera este tiempo de
// silencio para juntar todo en un solo mensaje antes de mandarlo al LLM.
const FIRST_MESSAGE_DEBOUNCE_MS = Number(process.env.WHATSAPP_BOT_FIRST_MESSAGE_DEBOUNCE_MS) || 5000;

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

function parseChoice(text, options) {
  const trimmed = (text || '').trim();
  const asNumber = parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  const normalizedInput = normalize(trimmed);
  return options.find((opt) => {
    const normalizedOpt = normalize(opt);
    return normalizedOpt.includes(normalizedInput) || normalizedInput.includes(normalizedOpt);
  }) || null;
}

function formatQuestion(step, number, total) {
  let text = `📌 *Pregunta ${number} de ${total}:* ${step.question_text}`;
  if (step.input_type === 'choice' && step.options?.length) {
    text += `\n\n${numberedList(step.options)}`;
  }
  return text;
}

/**
 * Flujo conversacional automático de Avan por WhatsApp, guiado por el
 * guion editable en `whatsapp_bot_steps` (texto, orden y activo/inactivo
 * configurables desde el panel admin). Al finalizar, evalúa la viabilidad,
 * envía el reporte por correo (si se recogió un correo) y registra/actualiza
 * el lead en el funnel de ventas.
 */
export class WhatsappBotService {
  constructor({ ollamaService, emailService, leadService, whatsappMessageService, stepService, googleCalendarService }) {
    this.ollamaService = ollamaService;
    this.emailService = emailService;
    this.leadService = leadService;
    this.whatsappMessageService = whatsappMessageService;
    this.stepService = stepService || new WhatsappBotStepService();
    this.googleCalendarService = googleCalendarService;
    // wa_id -> { messages: string[], timer: NodeJS.Timeout }, buffer temporal
    // de los primeros mensajes de un contacto nuevo mientras se espera el
    // silencio de FIRST_MESSAGE_DEBOUNCE_MS antes de iniciar la sesión.
    this.pendingFirstMessages = new Map();
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
   * si fuera un contacto totalmente nuevo (pasa de nuevo por el buffer de 5s
   * y el saludo generado por el LLM). Útil para volver a probar el flujo con
   * un número que ya completó el guion o quedó pausado, sin tener que
   * esperar a un contacto nuevo. No borra el historial de mensajes visible
   * en el hilo, solo el estado interno del bot.
   */
  async resetSession(waId) {
    const pending = this.pendingFirstMessages.get(waId);
    if (pending?.timer) clearTimeout(pending.timer);
    this.pendingFirstMessages.delete(waId);

    await db('whatsapp_bot_sessions').where({ wa_id: waId }).delete();
    this.logActivity({ type: 'reset', waId });
  }

  async setBotEnabled(waId, enabled) {
    const existing = await this.getSession(waId);
    if (existing) {
      await this.updateSession(waId, { bot_enabled: enabled });
    } else {
      await db('whatsapp_bot_sessions').insert({ wa_id: waId, step: 0, status: 'active', bot_enabled: enabled, answers: JSON.stringify({}) });
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
   * Procesa un mensaje de texto entrante del flujo de Avan. Si el
   * contacto no tiene sesión, la inicia con el saludo y la primera pregunta
   * activa (según el guion configurado en ese momento).
   */
  async handleIncomingMessage(waId, text) {
    // Si ya hay un buffer de "primer contacto" en curso para este wa_id, esta
    // burbuja se suma a las anteriores y se reinicia la espera de silencio,
    // en vez de arrancar una sesión por cada mensaje suelto.
    if (this.pendingFirstMessages.has(waId)) {
      this.bufferFirstMessage(waId, text);
      return;
    }

    const session = await this.getSession(waId);

    if (!session) {
      this.bufferFirstMessage(waId, text);
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

    const stepSequence = session.step_sequence
      ? (typeof session.step_sequence === 'string' ? JSON.parse(session.step_sequence) : session.step_sequence)
      : LEGACY_STEP_ORDER;
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    const currentIndex = session.step;
    const currentKey = stepSequence[currentIndex];
    const currentStep = await this.stepService.getByKey(currentKey);

    if (!currentStep) {
      // La pregunta actual fue eliminada/renombrada después de iniciada la
      // sesión; se registra lo que se tenga y se finaliza para no dejar al
      // contacto esperando una pregunta que ya no existe.
      await this.finalize(waId, answers);
      return;
    }

    let value = (text || '').trim();
    if (currentStep.input_type === 'choice') {
      const choice = parseChoice(text, currentStep.options || []);
      if (!choice) {
        await this.send(waId, `⚠️ No reconocí esa opción. Responde solo con el número:\n\n${numberedList(currentStep.options || [])}`);
        return;
      }
      value = choice;
    } else if (currentKey === 'email' && !value.includes('@')) {
      await this.send(waId, '⚠️ Por favor ingresa un correo electrónico válido (ejemplo: usuario@gmail.com).');
      return;
    }

    answers[currentKey] = value;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= stepSequence.length) {
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.finalize(waId, answers);
      return;
    }

    await this.updateSession(waId, { step: nextIndex, answers: JSON.stringify(answers) });
    const nextStep = await this.stepService.getByKey(stepSequence[nextIndex]);
    await this.send(waId, formatQuestion(nextStep, nextIndex + 1, stepSequence.length));
  }

  /**
   * Agrega una burbuja al buffer de "primer contacto" de este wa_id y
   * reinicia el temporizador de silencio. Cuando el contacto deja de escribir
   * por FIRST_MESSAGE_DEBOUNCE_MS, se dispara startConversation() con todo lo
   * acumulado unido en un solo texto.
   */
  bufferFirstMessage(waId, text) {
    const pending = this.pendingFirstMessages.get(waId) || { messages: [], timer: null };
    if (text && text.trim()) pending.messages.push(text.trim());

    this.logActivity({
      type: 'buffer',
      waId,
      text,
      bufferSize: pending.messages.length,
      waitMs: FIRST_MESSAGE_DEBOUNCE_MS
    });

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this.pendingFirstMessages.delete(waId);
      this.startConversation(waId, pending.messages.join('\n')).catch((error) => {
        this.logActivity({ type: 'conversation_start_failed', waId, error: error.message });
        console.error(`❌ [WhatsApp Bot] Error al iniciar la conversación con ${waId}:`, error);
      });
    }, FIRST_MESSAGE_DEBOUNCE_MS);

    this.pendingFirstMessages.set(waId, pending);
  }

  /**
   * Arranca la sesión de un contacto nuevo: genera con el LLM de Ollama Cloud
   * un saludo humanizado (a partir de todo lo que escribió en sus primeras
   * burbujas) que cierra con una pregunta que lo dirige al guion, y deja la
   * sesión lista en el paso 0 para que la siguiente respuesta del contacto se
   * procese como la respuesta a la primera pregunta activa.
   */
  async startConversation(waId, joinedFirstMessage) {
    const activeSteps = await this.stepService.getActiveOrdered();
    if (activeSteps.length === 0) {
      console.warn('⚠️ [WhatsApp Bot] No hay preguntas activas configuradas, no se puede iniciar el flujo.');
      return;
    }

    const stepSequence = activeSteps.map((s) => s.step_key);
    await db('whatsapp_bot_sessions').insert({
      wa_id: waId,
      step: 0,
      status: 'active',
      bot_enabled: true,
      answers: JSON.stringify({}),
      step_sequence: JSON.stringify(stepSequence)
    });

    // El contacto pasa de "Conversación Abierta" a "En Calificación" en el
    // Setter Funnel apenas Avan arranca el guion estructurado con él.
    await this.moveFunnelStage(waId, 'calificando');

    this.logActivity({
      type: 'llm_request',
      waId,
      prompt: joinedFirstMessage,
      model: this.ollamaService.chatModel,
      host: this.ollamaService.host
    });
    const startedAt = Date.now();
    const welcome = await this.ollamaService.generateWelcomeMessage(joinedFirstMessage);
    this.logActivity({
      type: 'llm_response',
      waId,
      text: welcome.text,
      source: welcome.source,
      latencyMs: Date.now() - startedAt
    });

    await this.send(waId, welcome.text);
  }

  /**
   * Evalúa la viabilidad con IA, envía el reporte por correo (si se recogió
   * uno) y crea/actualiza el lead correspondiente en el funnel de ventas.
   * Las preguntas desactivadas usan su valor por defecto configurado, para
   * que el reporte y el lead siempre queden completos.
   */
  async finalize(waId, answers) {
    const allSteps = await this.stepService.getAll();
    const defaults = {};
    for (const step of allSteps) defaults[step.step_key] = step.default_value || '';

    const problem = answers.problem || defaults.problem || 'Tema de tesis por definir';
    const location = answers.location || defaults.location || 'Perú';
    const level = answers.level || defaults.level || 'Pregrado (Bachiller/Título)';
    const field = answers.field || defaults.field || 'Ingeniería de Sistemas y Computación';
    const email = answers.email || defaults.email || '';

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
