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

// Seguimiento por inactividad: si el contacto deja a Avan "en visto" 1 hora,
// se le manda un recordatorio; si sigue una hora más sin responder, el lead
// se mueve a "Congelado" en el Setter Funnel y el bot deja de insistir.
const INACTIVITY_NUDGE_MS = 60 * 60 * 1000;
const INACTIVITY_FREEZE_MS = 60 * 60 * 1000;

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long'
});

function formatDateLabel(dateStr) {
  // dateStr: "YYYY-MM-DD" en calendario de Lima; se ancla al mediodía UTC
  // para que ninguna conversión de zona horaria lo empuje al día anterior.
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = DATE_LABEL_FORMATTER.format(new Date(Date.UTC(y, m - 1, d, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function limaTodayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const MEETING_DATETIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
});

function formatMeetingDateTimeLabel(isoStr) {
  const label = MEETING_DATETIME_FORMATTER.format(new Date(isoStr)).replace(/\./g, '').replace(/\s([ap])\s?m\b/, ' $1.m.');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Placeholder que usa findOrCreateFromWhatsApp() cuando WhatsApp no compartió
// un nombre de perfil real — no debe tratarse como el nombre del contacto.
const GENERIC_CONTACT_NAME = 'Contacto de WhatsApp';

function firstNameOf(fullName) {
  if (!fullName || fullName === GENERIC_CONTACT_NAME) return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

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
  constructor({ ollamaService, emailService, leadService, whatsappMessageService, settingsService, googleCalendarService, scheduledMeetingService, notificationService }) {
    this.ollamaService = ollamaService;
    this.emailService = emailService;
    this.leadService = leadService;
    this.whatsappMessageService = whatsappMessageService;
    this.scheduledMeetingService = scheduledMeetingService;
    this.notificationService = notificationService;
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

    if (!session.bot_enabled) {
      this.logActivity({
        type: 'skipped',
        waId,
        text,
        reason: 'El bot está pausado para este contacto (alguien respondió manualmente). Actívalo con "▶️ Activar bot" en el panel.'
      });
      return;
    }

    if (session.status === 'completed') {
      // Si ya tiene una reunión real agendada, un mensaje nuevo puede ser
      // algo que sí necesita atención (reagendar, queja, pregunta por el
      // link) — se clasifica en vez de ignorarlo sin más. Si nunca llegó a
      // agendar (transferido a asesor sin reunión, descartado, etc.), sigue
      // igual que antes: el bot ya no vuelve a responder solo.
      const meeting = this.scheduledMeetingService ? await this.scheduledMeetingService.getLatestForContact(waId) : null;
      if (meeting) {
        await this.handlePostBookingMessage(waId, meeting, text);
        return;
      }

      this.logActivity({
        type: 'skipped',
        waId,
        text,
        reason: 'La conversación ya está marcada como "completed" sin una reunión agendada; el bot no vuelve a responder automáticamente. Usa "🔄 Reiniciar conversación" en el panel para probarla de nuevo.'
      });
      return;
    }

    if (session.status === 'scheduling_date') {
      await this.clearNudge(waId);
      await this.handleSchedulingDateReply(waId, session, text);
      return;
    }

    if (session.status === 'scheduling_time') {
      await this.clearNudge(waId);
      await this.handleSchedulingTimeReply(waId, session, text);
      return;
    }

    // status === 'active': se agrupa antes de procesar el turno.
    await this.clearNudge(waId);
    this.bufferMessage(waId, text);
  }

  /**
   * Borra el recordatorio de inactividad pendiente (si lo hay) apenas el
   * contacto vuelve a escribir, para que el barrido de checkStaleConversations()
   * no lo congele por una inactividad que ya terminó.
   */
  async clearNudge(waId) {
    const session = await this.getSession(waId);
    if (session?.nudge_sent_at) {
      await db('whatsapp_bot_sessions').where({ wa_id: waId }).update({ nudge_sent_at: null });
    }
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
    // Acotado a mensajes desde que arrancó ESTA sesión: si el contacto ya
    // había hablado con Avan antes y alguien reinició la conversación desde
    // el panel, esa sesión (y su fecha de inicio) es nueva, así que el LLM
    // no arrastra el hilo de la conversación anterior aunque siga guardado.
    const thread = await this.whatsappMessageService.getThread(waId, { limit: 40, since: session.created_at });
    const history = thread
      .filter((m) => m.body && m.body.trim())
      .map((m) => ({ direction: m.direction, text: m.body }));

    const lead = await this.leadService.findByPhone(waId);
    const contactName = firstNameOf(lead?.full_name);

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
      toneInstructions: settings.tone_instructions,
      contactName
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

    // El correo ya no es obligatorio: basta con conocer el tema para pasar
    // a la llamada con el asesor (el correo, si lo dejó, solo se usa para
    // la invitación del Meet y el reporte de respaldo, ambos en silencio).
    if (result.ready && answers.problem) {
      await this.finalize(waId, answers);
    }
  }

  /**
   * Ya con el tema de tesis en mano, el objetivo pasa a agendar la llamada
   * con el asesor: se avisa al lead que lo va a conectar, y por detrás (sin
   * anunciarlo en el chat) se evalúa la viabilidad con IA y se crea/actualiza
   * el lead en el funnel de ventas, para que llegue con puntaje al CRM y el
   * equipo tenga un reporte de respaldo. Un fallo en la evaluación con IA no
   * debe impedir ofrecer la llamada, que es lo que realmente importa aquí.
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
      '¡Genial! Con lo que me cuentas, quiero conectarte con un asesor de Avantage Group para que lo revisen juntos 🙌 Dame un momento...'
    );

    // El status NO se toca aquí a propósito: el lead se queda en
    // "calificando" (Setter Funnel) mientras se resuelve el agendamiento.
    // Solo pasa a "cita_agendada" o "transferido_closer" — y recién ahí
    // entra al Funnel de Ventas — cuando se sabe el desenlace real (ver
    // handleSchedulingTimeReply / handOffToAdvisor).
    const leadPayload = {
      topic: synthesizedTopic,
      academicLevel: level,
      fieldOfStudy: field,
      email,
      additionalNotes,
      source: 'WhatsApp Directo'
    };

    try {
      const reportData = await this.ollamaService.evaluateThesisViability({
        topic: synthesizedTopic,
        academicLevel: level,
        fieldOfStudy: field,
        additionalNotes
      });
      leadPayload.overallViabilityScore = reportData.evaluation.overallViabilityScore;
      leadPayload.viabilityLevel = reportData.evaluation.viabilityLevel;

      if (email) {
        const emailStatus = await this.emailService.sendReportEmail(email, reportData);
        if (!emailStatus.success) {
          console.warn(`⚠️ [WhatsApp Bot] El correo a ${email} no se pudo confirmar como enviado.`);
        }
      }
    } catch (error) {
      // La evaluación con IA es un valor agregado para el CRM, no un
      // requisito para agendar: si falla, el lead igual se registra (sin
      // puntaje) y la conversación sigue directo a proponer la llamada.
      console.error(`❌ [WhatsApp Bot] Error al evaluar la viabilidad para ${waId} (no bloquea el agendamiento):`, error);
    }

    try {
      const existingLead = await this.leadService.findByPhone(waId);
      if (existingLead) {
        await this.leadService.updateLead(existingLead.id, leadPayload);
      } else {
        await this.leadService.createLead({ ...leadPayload, phone: waId });
      }
    } catch (error) {
      console.error(`❌ [WhatsApp Bot] Error al registrar el lead de ${waId}:`, error);
    }

    await this.offerScheduling(waId, { topic: synthesizedTopic, email });
  }

  /**
   * Cuando no se puede ofrecer agendar (Calendar no configurado/conectado, o
   * sin bloques libres), transfiere al lead a seguimiento manual: cierra la
   * sesión del bot y mueve el lead a "Transferido a Closer" — ahí sí entra
   * al Funnel de Ventas para que un asesor lo contacte directamente.
   */
  async handOffToAdvisor(waId, reason) {
    this.logActivity({ type: 'scheduling_offer_skipped', waId, reason });
    await this.updateSession(waId, { status: 'completed' });
    await this.moveFunnelStage(waId, 'transferido_closer');
    await this.send(waId, 'Un asesor se pondrá en contacto contigo pronto para coordinar una llamada. ¡Gracias! 🙌');
  }

  /**
   * Tras finalizar la evaluación, empieza el agendamiento preguntando qué
   * día prefiere el lead (en vez de tirarle de una una lista de horarios) —
   * ese día se interpreta en el siguiente turno vía IA y se cruza con el
   * calendario real del asesor. Si Calendar no está listo o no hay ningún
   * bloque libre en los próximos días, se transfiere a seguimiento manual
   * sin bloquear la conversación.
   */
  async offerScheduling(waId, { topic, email }) {
    try {
      if (!this.googleCalendarService?.isConfigured()) throw new Error('Google Calendar no configurado en el servidor');

      const connection = await this.googleCalendarService.getConnection(BOOKING_ADVISOR_USER_ID);
      if (!connection) throw new Error('El asesor por defecto no tiene Google Calendar conectado');

      const preview = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID, { limit: 1 });
      if (preview.length === 0) throw new Error('Sin bloques libres próximos');

      const session = await this.getSession(waId);
      const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
      answers.__scheduling = { topic, email };
      await this.updateSession(waId, { status: 'scheduling_date', answers: JSON.stringify(answers) });

      await this.send(waId, '📅 ¿Qué día te gustaría para la llamada? (ej: "mañana", "el jueves", o una fecha)');
    } catch (error) {
      await this.handOffToAdvisor(waId, error.message);
    }
  }

  /**
   * Interpreta con IA qué día pidió el lead y muestra los horarios libres
   * reales de ese día. Si ese día no tiene espacio, ofrece de una vez las
   * próximas alternativas reales en vez de hacerlo adivinar otra fecha.
   */
  async handleSchedulingDateReply(waId, session, text) {
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    const scheduling = answers.__scheduling;
    if (!scheduling) {
      await this.updateSession(waId, { status: 'completed' });
      return;
    }

    const trimmed = (text || '').trim();
    if (['no', 'omitir', 'despues', 'después'].includes(normalize(trimmed))) {
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'El lead prefirió no agendar.');
      return;
    }

    const { date } = await this.ollamaService.parseSchedulingDate(trimmed, limaTodayIso());
    if (!date) {
      await this.send(waId, 'No logré identificar el día 🤔 ¿me confirmas una fecha? (ej: "mañana", "el jueves", "28 de agosto")');
      return;
    }

    let slots = await this.googleCalendarService.getFreeSlotsForDate(BOOKING_ADVISOR_USER_ID, date);
    let intro = `📅 Para el *${formatDateLabel(date)}*, tengo estos horarios libres:`;

    if (slots.length === 0) {
      slots = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID);
      if (slots.length === 0) {
        delete answers.__scheduling;
        await this.updateSession(waId, { answers: JSON.stringify(answers) });
        await this.handOffToAdvisor(waId, 'Sin bloques libres tras pedirle una fecha al lead.');
        return;
      }
      intro = `Ese día no tengo espacio libre, pero tengo estos horarios cercanos:`;
    }

    scheduling.slots = slots;
    await this.updateSession(waId, { status: 'scheduling_time', answers: JSON.stringify(answers) });

    const list = numberedList(slots.map((s) => s.label));
    await this.send(waId, `${intro}\n\n${list}\n\nResponde con el número que prefieras, o "no" si prefieres que te contacten después.`);
  }

  /**
   * Procesa la elección de horario: un número válido crea el evento real en
   * Google Calendar (con link de Meet), lo registra en `scheduled_meetings`
   * para la vista de "Próximas reuniones" del panel, y mueve el lead a "Cita
   * Agendada" (entra recién ahí al Funnel de Ventas). "no" transfiere a
   * seguimiento manual.
   */
  async handleSchedulingTimeReply(waId, session, text) {
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    const scheduling = answers.__scheduling;

    if (!scheduling) {
      await this.updateSession(waId, { status: 'completed' });
      return;
    }

    const trimmed = (text || '').trim();
    if (['no', 'omitir', 'despues', 'después'].includes(normalize(trimmed))) {
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'El lead prefirió no agendar.');
      return;
    }

    const labels = scheduling.slots.map((s) => s.label);
    const { index, preferredTime } = await this.ollamaService.parseSchedulingChoice(trimmed, labels);
    const slot = index !== null ? scheduling.slots[index] : null;

    if (!slot) {
      // Evita el bucle de "no reconocí esa opción" repitiendo la misma
      // lista: si el lead pidió un horario distinto al ofrecido, se busca
      // lo más cercano a lo que realmente quiere en los próximos días. Si
      // tras unos intentos igual no converge, se transfiere a un asesor
      // para que coordine el horario directamente.
      scheduling.attempts = (scheduling.attempts || 0) + 1;

      if (scheduling.attempts >= 3) {
        delete answers.__scheduling;
        await this.updateSession(waId, { answers: JSON.stringify(answers) });
        await this.handOffToAdvisor(waId, 'No se logró coincidir en un horario tras varios intentos.');
        return;
      }

      if (preferredTime) {
        const nearSlots = await this.googleCalendarService.getFreeSlotsNearTime(BOOKING_ADVISOR_USER_ID, preferredTime);
        if (nearSlots.length > 0) {
          scheduling.slots = nearSlots;
          await this.updateSession(waId, { answers: JSON.stringify(answers) });
          await this.send(
            waId,
            `Ese horario no lo tengo libre, pero tengo estos más cercanos a lo que buscas:\n\n${numberedList(nearSlots.map((s) => s.label))}\n\nResponde con el número que prefieras, o "no" si prefieres que te contacten después.`
          );
          return;
        }
      }

      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.send(
        waId,
        `⚠️ No reconocí esa opción. Responde con el número del horario, o "no" si prefieres que te contacten después:\n\n${numberedList(labels)}`
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
      await this.moveFunnelStage(waId, 'cita_agendada');

      if (this.scheduledMeetingService) {
        try {
          await this.scheduledMeetingService.create({
            leadId: lead?.id ?? null,
            waId,
            advisorUserId: BOOKING_ADVISOR_USER_ID,
            topic: scheduling.topic,
            startTime: slot.startTime,
            endTime: slot.endTime,
            meetLink: event.meetLink,
            calendarEventId: event.eventId
          });
        } catch (recordError) {
          console.error(`❌ [WhatsApp Bot] Error al registrar la reunión de ${waId} en scheduled_meetings:`, recordError);
        }
      }

      const name = firstNameOf(lead?.full_name);

      if (this.notificationService) {
        try {
          await this.notificationService.create({
            type: 'meeting_booked',
            title: `Reunión agendada con ${name || waId}`,
            body: `${slot.label}${scheduling.topic ? ` — ${scheduling.topic}` : ''}`,
            link: '/admin/availability'
          });
        } catch (notifyError) {
          console.error(`❌ [WhatsApp Bot] Error al crear la notificación de reunión agendada para ${waId}:`, notifyError);
        }
      }

      await this.send(
        waId,
        `✅ ¡Listo${name ? `, ${name}` : ''}! Tu llamada quedó agendada para *${slot.label}*.` +
        (event.meetLink ? `\n\n🔗 Link de Google Meet: ${event.meetLink}` : '') +
        '\n\nTe esperamos. ¡Gracias! 🙌'
      );
    } catch (error) {
      console.error(`❌ [WhatsApp Bot] Error al agendar la reunión para ${waId}:`, error);
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, `Error técnico al crear el evento: ${error.message}`);
    }
  }

  /**
   * Barrido periódico (llamado desde server.js con un setInterval, igual que
   * el sondeo de seguidores de Meta) para el seguimiento por inactividad: a
   * la hora de silencio manda un recordatorio único, y si sigue una hora más
   * sin responder, congela el lead en el Setter Funnel y apaga el bot para
   * ese contacto (no vuelve a insistir solo).
   */
  async checkStaleConversations() {
    const now = Date.now();

    const awaitingReply = await db('whatsapp_bot_sessions')
      .whereIn('status', ['active', 'scheduling_date', 'scheduling_time'])
      .where('bot_enabled', true)
      .whereNull('nudge_sent_at');

    for (const session of awaitingReply) {
      const silentMs = now - new Date(session.updated_at).getTime();
      if (silentMs < INACTIVITY_NUDGE_MS) continue;

      try {
        await this.send(session.wa_id, '¿Estás ahí? Seguimos esperando tu respuesta 👀');
        await db('whatsapp_bot_sessions').where({ id: session.id }).update({ nudge_sent_at: db.fn.now() });
        this.logActivity({ type: 'inactivity_nudge', waId: session.wa_id });
      } catch (error) {
        console.error(`❌ [WhatsApp Bot] Error al mandar el recordatorio de inactividad a ${session.wa_id}:`, error);
      }
    }

    const awaitingFreeze = await db('whatsapp_bot_sessions')
      .whereIn('status', ['active', 'scheduling_date', 'scheduling_time'])
      .where('bot_enabled', true)
      .whereNotNull('nudge_sent_at');

    for (const session of awaitingFreeze) {
      const silentSinceNudgeMs = now - new Date(session.nudge_sent_at).getTime();
      if (silentSinceNudgeMs < INACTIVITY_FREEZE_MS) continue;

      try {
        await db('whatsapp_bot_sessions').where({ id: session.id }).update({ status: 'completed' });
        await this.moveFunnelStage(session.wa_id, 'congelado');
        this.logActivity({ type: 'inactivity_frozen', waId: session.wa_id });
      } catch (error) {
        console.error(`❌ [WhatsApp Bot] Error al congelar la conversación de ${session.wa_id}:`, error);
      }
    }
  }

  /**
   * Mensaje nuevo de un lead que YA tiene una reunión real agendada. En vez
   * de ignorarlo (como cualquier otra sesión "completed"), se clasifica con
   * IA: saludos/agradecimientos cortos no necesitan respuesta; preguntas
   * sobre la reunión (link/hora) se responden solas con los datos reales;
   * pedidos de reagendar, quejas o consultas nuevas generan una respuesta
   * breve y quedan marcados como urgentes en las notificaciones del panel
   * para que un asesor los revise.
   */
  async handlePostBookingMessage(waId, meeting, text) {
    const lead = await this.leadService.findByPhone(waId);
    const contactName = firstNameOf(lead?.full_name);

    const result = await this.ollamaService.classifyPostBookingMessage(text, {
      meetingLabel: formatMeetingDateTimeLabel(meeting.start_time),
      meetLink: meeting.meet_link,
      contactName
    });

    this.logActivity({ type: 'post_booking_classified', waId, text, needsReply: result.needsReply, isUrgent: result.isUrgent, source: result.source });

    if (!result.needsReply) return;

    await this.send(waId, result.replyText || 'Un asesor del equipo te va a escribir directamente para ayudarte con eso. ¡Gracias! 🙌');

    if (result.isUrgent && this.notificationService) {
      try {
        await this.notificationService.create({
          type: 'post_booking_attention',
          title: `${contactName || waId} necesita seguimiento`,
          body: `Ya tiene una llamada agendada (${formatMeetingDateTimeLabel(meeting.start_time)}) pero escribió: "${text}"`,
          link: '/admin/whatsapp'
        });
      } catch (error) {
        console.error(`❌ [WhatsApp Bot] Error al crear la notificación de seguimiento para ${waId}:`, error);
      }
    }
  }
}
