import { randomUUID } from 'crypto';
import { db } from '../db/connection.js';
import { WhatsappBotSettingsService } from './whatsappBotSettingsService.js';
import { buildKnowledgeBlock } from './whatsappBotPromptDefaults.js';

const MAX_ACTIVITY_LOG = 100;

// Espera mínima estricta entre dos mensajes salientes del bot al MISMO
// contacto: evita ráfagas de mensajes instantáneos que WhatsApp puede marcar
// como comportamiento de spam/bot (afecta la calidad del número o lo lleva a
// una restricción). Es configurable por contacto desde el panel
// (whatsapp_bot_settings.message_gap_seconds); este valor solo es el
// respaldo si la configuración no está disponible.
const DEFAULT_MESSAGE_GAP_MS = (Number(process.env.WHATSAPP_BOT_MESSAGE_GAP_SECONDS) || 5) * 1000;

// Pausa breve de "está escribiendo" antes de un mensaje cuando ya pasó de
// sobra la espera mínima desde el mensaje anterior (para que no salga
// instantáneo tras una operación lenta como la llamada al LLM).
const TYPING_PAUSE_MS = 1500;

// Asesor cuyo Google Calendar usa el bot para agendar las llamadas que
// ofrece al terminar de calificar el tema (por ahora uno solo, fijo, en vez
// de resolver dinámicamente a partir de "assigned_to" del lead).
const BOOKING_ADVISOR_USER_ID = Number(process.env.GOOGLE_BOOKING_ADVISOR_USER_ID) || 1;

// Horizonte máximo de agendamiento: solo se ofrecen (y aceptan) horarios de
// hoy hasta N días más adelante (N = 1 → hoy y mañana). days = N + 1 en los constructores de bloques,
// que cuentan el día 0 = hoy.
const MAX_BOOKING_DAYS_AHEAD = Number(process.env.WHATSAPP_BOOKING_MAX_DAYS_AHEAD) || 1;
const BOOKING_WINDOW_DAYS = MAX_BOOKING_DAYS_AHEAD + 1;

// Cantidad de horarios que se le ofrecen al contacto a la vez.
const SLOTS_TO_OFFER = 3;

// Estados del flujo de agendamiento (todos "esperan respuesta del contacto").
const SCHEDULING_STATUSES = ['scheduling_mode', 'scheduling_phone', 'scheduling_email', 'scheduling_date', 'scheduling_time'];

// Descuento que se aplica si el lead elige reunión por Google Meet en vez de
// llamada telefónica (solo informativo: lo confirma el jefe comercial).
const MEET_DISCOUNT_PCT = Number(process.env.WHATSAPP_MEET_DISCOUNT_PCT) || 10;

// Los mensajes de un contacto suelen llegar en varias burbujas seguidas
// (p. ej. "Hola" y luego, unos segundos después, el tema real). En vez de
// mandarle cada burbuja al LLM por separado, se espera este tiempo de
// silencio para juntar todo en un solo mensaje antes de procesar el turno.
// Al inicio de la conversación la espera es mayor: es cuando la gente escribe
// más entrecortado ("hola" / "quiero info sobre el costo").
const MESSAGE_DEBOUNCE_MS = Number(process.env.WHATSAPP_BOT_FIRST_MESSAGE_DEBOUNCE_MS) || 7000;

// En el agendamiento y después de agendar la espera es más corta: ahí el
// contacto casi siempre responde en una sola burbuja ("2", su correo, el
// número del horario), y hacerlo esperar lo mismo que en la conversación
// libre para confirmarle algo que ya eligió se siente lento.
const SCHEDULING_DEBOUNCE_MS = Number(process.env.WHATSAPP_BOT_SCHEDULING_DEBOUNCE_MS) || 5000;
const POST_BOOKING_DEBOUNCE_MS = Number(process.env.WHATSAPP_BOT_POST_BOOKING_DEBOUNCE_MS) || 5000;

// Cuando lo único que llegó es un saludo suelto ("hola", "buenas tardes"), la
// espera se amplía UNA vez por este tiempo extra. Un saludo no aporta ningún
// dato y casi siempre viene seguido del mensaje real unos segundos después:
// procesarlo por su cuenta gasta un turno de LLM que termina descartándose y
// retrasa la respuesta de verdad.
const GREETING_EXTRA_WAIT_MS = Number(process.env.WHATSAPP_BOT_GREETING_EXTRA_WAIT_MS) || 8000;

const GREETING_ONLY_RE = /^(?:hola+|ola+|buenas|buenos d[ií]as|buenas tardes|buenas noches|buen d[ií]a|hi|hey|saludos|qu[eé] tal|holi+)(?:\s+(?:hola+|buenas|d[ií]as|tardes|noches|amigo|se[ñn]or(?:ita)?|buen d[ií]a))*[\s!¡.,?¿]*$/i;

/** ¿El texto acumulado es solo un saludo, sin ningún contenido? */
function isGreetingOnly(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 0 && clean.length <= 40 && GREETING_ONLY_RE.test(clean);
}

// Seguimiento por inactividad: si el contacto deja a Avan "en visto" 1 hora,
// se le manda un recordatorio; si sigue una hora más sin responder, el lead
// se mueve a "Congelado" en el Setter Funnel y el bot deja de insistir.
const INACTIVITY_NUDGE_MS = 60 * 60 * 1000;
const INACTIVITY_FREEZE_MS = 60 * 60 * 1000;

const SHORT_DAY_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric'
});

/**
 * Etiqueta corta de día para las frases del bot, ej. "viernes 28" (o "hoy" si
 * es hoy). `dateStr` es "YYYY-MM-DD" en calendario de Lima; se ancla al
 * mediodía UTC para que ninguna conversión de zona horaria lo empuje al día
 * anterior.
 */
function formatShortDayLabel(dateStr) {
  if (dateStr === limaTodayIso()) return 'hoy';
  const [y, m, d] = dateStr.split('-').map(Number);
  return SHORT_DAY_FORMATTER.format(new Date(Date.UTC(y, m - 1, d, 12))).replace(',', '');
}

/**
 * El mismo día pero listo para ir detrás de una preposición: "hoy" no lleva
 * artículo ("para hoy"), los demás sí ("para el domingo 6"). Sin esto salía
 * "Horarios para el hoy".
 */
function dayLabelWithArticle(dateStr) {
  const label = formatShortDayLabel(dateStr);
  return label === 'hoy' ? label : `el ${label}`;
}

function limaTodayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** ¿El texto que escribió el lead parece un número de teléfono usable? (7-15 dígitos) */
function looksLikePhone(value) {
  const d = digitsOnly(value);
  return d.length >= 7 && d.length <= 15;
}

/**
 * ¿El wa_id ES un número de teléfono real (no un BSUID tipo "PE.15518885...")?
 * Los BSUID de Instagram/Facebook traen 15 dígitos pero también un prefijo de
 * letras y un punto, así que se exige que el wa_id sea SOLO dígitos.
 */
function waIdIsPhone(waId) {
  return /^\d{8,15}$/.test(String(waId || ''));
}

// Direcciones de correo dentro de un texto libre. Se excluyen explícitamente
// los caracteres que suelen venir pegados en un mensaje de WhatsApp
// ("(", ",", ";", comillas...) para no arrastrarlos dentro de la dirección.
const EMAIL_RE = /[^\s<>()[\],;:"']+@[^\s<>()[\],;:"']+\.[a-z]{2,}/i;

/**
 * Extrae la dirección de correo de un texto libre, o null si no hay ninguna.
 *
 * Es importante que sea una EXTRACCIÓN y no un simple test: el contacto casi
 * nunca manda el correo solo ("mi correo es kevin@gmail.com pero quiero saber
 * cuánto dura la reunión"). Guardar el mensaje entero como correo hacía que
 * Google Calendar rechazara el invitado y la reunión no llegara a crearse.
 */
function extractEmail(value) {
  const match = String(value || '').match(EMAIL_RE);
  return match ? match[0].replace(/[.,;:]+$/, '').toLowerCase() : null;
}

function looksLikeEmail(value) {
  return !!extractEmail(value);
}

/** Interpreta la elección de modalidad de llamada: 'phone' | 'meet' | null. */
function parseCallMode(text) {
  const n = normalize(text || '');
  const isRefusal = ['no', 'ninguna', 'ninguno'].includes(n.trim());
  if (isRefusal) return null;
  if (/(^|\D)1(\D|$)/.test(n) || n.includes('telefon') || n.includes('llamada telef') || n.includes('celular') || n.includes('numero')) return 'phone';
  if (/(^|\D)2(\D|$)/.test(n) || n.includes('meet') || n.includes('video') || n.includes('virtual') || n.includes('descuento') || n.includes('zoom')) return 'meet';
  return null;
}

const MEETING_DATETIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
});

const LIMA_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

/** Hora de Lima ("HH:MM", 24h) de un instante ISO. */
function limaTimeOf(isoStr) {
  return LIMA_TIME_FORMATTER.format(new Date(isoStr));
}

/** "18:00" -> "6:00 p.m.", para nombrarle al lead la hora que él pidió. */
function formatClockLabel(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const period = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

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

/**
 * Etiquetas para la lista numerada de horarios. Si los tres bloques caen el
 * mismo día (el caso normal, y el día ya se nombró en la frase de arriba) se
 * muestra solo la hora: repetir "Sáb, 5 set" tres veces es ruido. Si hay
 * varios días, cada opción lleva su fecha para que no se confundan.
 *
 * `timeLabel` puede faltar en sesiones guardadas antes de este cambio; en ese
 * caso se cae a la etiqueta completa.
 */
function slotOptionLabels(slots) {
  const list = slots || [];
  const sameDay = list.length > 0 && list.every((slot) => slot.date === list[0].date);
  return list.map((slot) => (sameDay && slot.timeLabel) ? slot.timeLabel : slot.label);
}

function numberedList(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

/**
 * ¿La respuesta del contacto es tan obviamente el dato que se le pidió que no
 * vale la pena gastar un turno de LLM en clasificarla? ("1", "51987654321",
 * "kevin@gmail.com"). Todo lo demás sí pasa por el clasificador, que es el
 * que detecta las preguntas sueltas en medio del agendamiento.
 */
function isObviousStepAnswer(status, text) {
  const t = (text || '').trim();
  if (!t) return true;
  if (t.length > 60 || /[?¿]/.test(t)) return false;

  switch (status) {
    case 'scheduling_mode':
    case 'scheduling_time':
      return /^\d{1,2}$/.test(t);
    case 'scheduling_phone':
      return /^[\d\s+()-]{7,20}$/.test(t);
    case 'scheduling_email':
      return /^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i.test(t);
    default:
      // scheduling_date: "mañana", "el jueves"... no hay forma barata de
      // distinguirlo de una pregunta, así que siempre se clasifica.
      return false;
  }
}

// Formas en que el LLM pregunta por la carrera o la universidad. Se usan para
// detectar que está preguntando por algo que la persona YA respondió.
const ASKS_FIELD_RE = /(?:de|en)\s+qu[eé]\s+carrera|qu[eé]\s+carrera\s+(?:estudias|est[aá]s|cursas|llevas|sigues)|cu[aá]l\s+es\s+tu\s+carrera/i;
const ASKS_UNIVERSITY_RE = /(?:de|en)\s+qu[eé]\s+universidad|qu[eé]\s+universidad\s+(?:estudias|est[aá]s|cursas)|cu[aá]l\s+es\s+tu\s+universidad|d[oó]nde\s+estudias/i;

/**
 * ¿La respuesta del LLM está preguntando por un dato que ya tenemos?
 *
 * Pasa porque el bloque "lo que te falta preguntar" del prompt se arma con lo
 * que se sabía ANTES de leer el mensaje nuevo: si ese mensaje traía el dato
 * ("sobre arquitectura de la continental"), el modelo a veces lo extrae
 * correctamente pero igual hace la pregunta que tenía pendiente. Devuelve
 * 'field' | 'university' | null.
 */
function detectRedundantAsk(reply, answers) {
  const text = String(reply || '');
  if (answers.field && ASKS_FIELD_RE.test(text)) return 'field';
  if (answers.university && ASKS_UNIVERSITY_RE.test(text)) return 'university';
  return null;
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
    // wa_id -> timestamp (reservado) del próximo envío permitido, para respetar
    // la espera mínima estricta entre mensajes incluso con envíos concurrentes.
    this.lastSentAt = new Map();
    // wa_id -> Promise del turno en curso. TODO lo que le responde al contacto
    // pasa por esta cola: nunca corren dos turnos en paralelo para el mismo
    // contacto (eso duplicaba mensajes y rompía la espera entre ellos).
    this.turnChains = new Map();
    // wa_id -> nº de mensajes entrantes recibidos de ese contacto. Un turno
    // anota el valor al empezar y lo vuelve a mirar antes de responder: si
    // cambió, el contacto siguió escribiendo mientras se preparaba la
    // respuesta, así que este turno se descarta y contesta el siguiente, ya
    // con TODO lo que escribió. Sin esto, cualquier burbuja que llegara
    // durante el turno (el LLM + la espera anti-spam tardan 10-15 s) generaba
    // una segunda respuesta suelta en vez de agruparse.
    this.inboundCounter = new Map();
    // wa_id -> message_id del último mensaje entrante, necesario para mostrarle
    // el indicador de "escribiendo..." de WhatsApp antes de responder.
    this.lastInboundMessageId = new Map();
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

  /**
   * Encola `fn` para que se ejecute cuando termine cualquier procesamiento
   * anterior del mismo contacto. Garantiza que jamás corran dos turnos en
   * paralelo para un wa_id (la causa de los mensajes duplicados).
   */
  runSerialized(waId, fn) {
    const prev = this.turnChains.get(waId) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fn());
    this.turnChains.set(waId, next);
    // Limpieza al terminar (ok o error). Se hace con un handler que NO
    // relanza, para que esta rama de la promesa no genere un
    // "unhandledRejection" (la rama `next` que se devuelve sí propaga el
    // error, y de ella se encarga quien llama con su propio .catch).
    const cleanup = () => {
      if (this.turnChains.get(waId) === next) this.turnChains.delete(waId);
    };
    next.then(cleanup, cleanup);
    return next;
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
    this.inboundCounter.delete(waId);

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

  /**
   * Envía un mensaje del bot respetando: (1) el indicador de "escribiendo..."
   * de WhatsApp si está habilitado, y (2) una espera mínima estricta desde el
   * mensaje anterior al mismo contacto (message_gap_seconds), para no caer en
   * comportamiento de spam.
   */
  async send(waId, text) {
    let settings = {};
    try {
      settings = await this.settingsService.get();
    } catch { /* si falla, se usan los valores por defecto de abajo */ }

    const gapMs = settings.message_gap_seconds != null
      ? Math.max(0, Number(settings.message_gap_seconds) * 1000)
      : DEFAULT_MESSAGE_GAP_MS;

    // Reserva el momento del próximo envío ANTES de esperar: si dos send()
    // corren casi a la vez, el segundo ve el timestamp reservado por el
    // primero y se encola detrás con el gap completo (en vez de que ambos
    // calculen la espera sobre el mismo "último envío" y salgan juntos).
    const now = Date.now();
    const reserved = this.lastSentAt.get(waId) || 0;
    const sendAt = reserved === 0
      ? now + gapMs
      : Math.max(now + TYPING_PAUSE_MS, reserved + gapMs);
    this.lastSentAt.set(waId, sendAt);
    const waitMs = sendAt - now;

    const typingEnabled = settings.typing_indicator_enabled == null ? true : !!settings.typing_indicator_enabled;
    if (typingEnabled) {
      const inboundId = this.lastInboundMessageId.get(waId);
      if (inboundId) {
        try {
          await this.whatsappMessageService.sendTypingIndicator(inboundId);
        } catch (error) {
          this.logActivity({ type: 'typing_indicator_failed', waId, error: error.message });
        }
      }
    }

    if (waitMs > 0) await sleep(waitMs);

    try {
      await this.whatsappMessageService.sendTextMessage(waId, text);
      // Ancla el próximo gap al envío real (por si el sleep se desvió), sin
      // bajar de lo ya reservado.
      this.lastSentAt.set(waId, Math.max(Date.now(), sendAt));
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
  async handleIncomingMessage(waId, text, messageId = null) {
    // Se guarda el id del mensaje entrante para poder mostrar el indicador de
    // "escribiendo..." de WhatsApp (que se envía referenciando ese id) antes
    // de cada respuesta del bot.
    if (messageId) this.lastInboundMessageId.set(waId, messageId);

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
        // También pasan por el buffer: quien ya agendó escribe igual de
        // entrecortado que el resto ("gracias" / "una consulta...").
        this.bufferMessage(waId, text, this.debounceForStatus(session.status));
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

    // Tanto la conversación libre ('active') como los pasos de agendamiento
    // se agrupan en el buffer de silencio: el contacto suele partir su
    // respuesta en varias burbujas ("mi correo es x@y.com" + "pero cuánto
    // dura la reunión?"), y procesarlas por separado hacía que la segunda se
    // interpretara como un dato inválido del paso. El turno que dispara el
    // buffer re-lee el estado real y enruta al handler que corresponda.
    await this.clearNudge(waId);
    this.bufferMessage(waId, text, this.debounceForStatus(session.status));
  }

  /**
   * Espera de agrupación que corresponde al estado de la sesión, para que la
   * bitácora y el buffer usen siempre el mismo criterio.
   */
  debounceForStatus(status) {
    if (SCHEDULING_STATUSES.includes(status)) return SCHEDULING_DEBOUNCE_MS;
    if (status === 'completed') return POST_BOOKING_DEBOUNCE_MS;
    return MESSAGE_DEBOUNCE_MS;
  }

  /**
   * Enruta un mensaje al handler correcto según el estado ACTUAL de la sesión
   * (re-leído justo antes de procesar). Se usa desde la cola serializada para
   * que un mensaje encolado mientras corría otro turno no se procese con un
   * estado ya obsoleto.
   */
  async dispatchByStatus(waId, text) {
    const session = await this.getSession(waId);
    if (!session || !session.bot_enabled) return;

    switch (session.status) {
      case 'scheduling_mode': return this.handleSchedulingModeReply(waId, session, text);
      case 'scheduling_phone': return this.handleSchedulingPhoneReply(waId, session, text);
      case 'scheduling_email': return this.handleSchedulingEmailReply(waId, session, text);
      case 'scheduling_date': return this.handleSchedulingDateReply(waId, session, text);
      case 'scheduling_time': return this.handleSchedulingTimeReply(waId, session, text);
      case 'active': return this.runConversationTurn(waId, text);
      default: return; // 'completed' u otro: no se hace nada aquí.
    }
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
  bufferMessage(waId, text, waitMs = MESSAGE_DEBOUNCE_MS) {
    this.inboundCounter.set(waId, (this.inboundCounter.get(waId) || 0) + 1);

    const pending = this.pendingMessages.get(waId) || { messages: [], timer: null };
    if (text && text.trim()) pending.messages.push(text.trim());
    // Una burbuja que llega mientras ya hay buffer conserva la espera con la
    // que se abrió (la del estado en que estaba el contacto).
    pending.waitMs = pending.waitMs ?? waitMs;

    this.logActivity({
      type: 'buffer',
      waId,
      text,
      bufferSize: pending.messages.length,
      waitMs: pending.waitMs
    });

    const fire = () => {
      this.pendingMessages.delete(waId);
      const joined = pending.messages.join('\n');
      // La marca se toma AQUÍ, no dentro del turno: entre que el temporizador
      // dispara y el turno lee la sesión hay consultas a la base de datos, y
      // una burbuja que cayera justo ahí ya no se detectaría como posterior.
      const mark = this.inboundCounter.get(waId) || 0;
      // A la cola serializada: si todavía hay un turno anterior en curso para
      // este contacto, este espera a que termine (y re-evalúa el estado)
      // en vez de correr en paralelo y duplicar mensajes.
      this.runSerialized(waId, () => this.runConversationTurn(waId, joined, mark)).catch((error) => {
        this.logActivity({ type: 'conversation_turn_failed', waId, error: error.message });
        console.error(`❌ [WhatsApp Bot] Error en el turno de conversación con ${waId}:`, error);
      });
    };

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      // Solo un saludo: se espera una vez más en vez de gastar un turno en
      // responder algo que no dice nada. Si en esa prórroga llega el mensaje
      // real, entra al mismo buffer y se responde todo junto.
      if (!pending.extendedForGreeting && isGreetingOnly(pending.messages.join(' '))) {
        pending.extendedForGreeting = true;
        this.logActivity({ type: 'buffer_extended', waId, text: pending.messages.join('\n'), waitMs: GREETING_EXTRA_WAIT_MS });
        pending.timer = setTimeout(fire, GREETING_EXTRA_WAIT_MS);
        return;
      }
      fire();
    }, pending.waitMs);

    this.pendingMessages.set(waId, pending);
  }

  /**
   * Ejecuta un turno del motor conversacional: arma el contexto (respuestas
   * ya conocidas + hilo de mensajes reales de WhatsApp), le pide al LLM la
   * siguiente respuesta natural y los datos que pudo extraer, los guarda, y
   * si ya reunió lo mínimo (tema + correo) pasa a evaluar y ofrecer agendar.
   */
  async runConversationTurn(waId, incomingText, inboundMark = null) {
    let session = await this.getSession(waId);

    // El estado pudo cambiar mientras este turno esperaba en la cola
    // serializada (p. ej. un turno anterior ya pasó a ofrecer agendar). En ese
    // caso no se corre otro turno de conversación libre: se redirige el
    // mensaje al handler que corresponde al estado real.
    if (session && session.status !== 'active') {
      if (SCHEDULING_STATUSES.includes(session.status)) return this.handleSchedulingTurn(waId, session, incomingText);
      if (session.status === 'completed') {
        // Sesión cerrada pero con reunión agendada: el mensaje (ya agrupado)
        // se clasifica en vez de ignorarse. Sin reunión no se responde nada,
        // igual que antes.
        const meeting = this.scheduledMeetingService ? await this.scheduledMeetingService.getLatestForContact(waId) : null;
        if (meeting) return this.handlePostBookingMessage(waId, meeting, incomingText);
      }
      return;
    }
    if (session && !session.bot_enabled) return;

    // Marca del contador de entrantes (ver `inboundCounter`): si al final del
    // turno cambió, el contacto siguió escribiendo y este turno quedó
    // obsoleto. Normalmente llega desde el temporizador del buffer, que la
    // toma en el instante exacto en que se cierra la agrupación.
    const mark = inboundMark ?? (this.inboundCounter.get(waId) || 0);

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
      botIdentity: settings.bot_identity,
      botObjective: settings.bot_objective,
      promptRules: settings.prompt_rules,
      knowledgeBlock: buildKnowledgeBlock(settings),
      shortReplies: settings.short_replies_enabled == null ? true : !!settings.short_replies_enabled,
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
    if (extracted.university) answers.university = extracted.university;
    // Se guarda solo la dirección, aunque el LLM devuelva la frase completa.
    const extractedEmail = extractEmail(extracted.email);
    if (extractedEmail) answers.email = extractedEmail;

    // Lo que dijo sobre cuándo quiere la reunión ("a las 5 hoy") se guarda para
    // no volver a preguntárselo cuando toque elegir día y hora.
    if (result.preferredWhen) answers.__when = result.preferredWhen;

    await this.updateSession(waId, { answers: JSON.stringify(answers) });

    // El contacto siguió escribiendo mientras se preparaba esta respuesta: lo
    // ya extraído queda guardado (arriba), pero no se responde. El turno que
    // dispare el buffer nuevo contestará una sola vez, con todo el contexto.
    if ((this.inboundCounter.get(waId) || 0) !== mark) {
      this.logActivity({ type: 'turn_superseded', waId, text: incomingText, reply: result.reply });
      return;
    }

    // Para pasar a la reunión hacen falta los tres datos: tema, carrera y
    // universidad. Cuando se cumple, NO se manda `result.reply` (el LLM a
    // veces cierra con una pregunta suelta): offerScheduling() toma el hilo.
    // Red de seguridad contra la pregunta repetida: si el LLM pidió un dato que
    // la conversación ya tiene, se cambia su respuesta por la del dato que sí
    // falta (o se pasa a agendar, si ya no falta ninguno).
    const redundantAsk = detectRedundantAsk(result.reply, answers);
    if (redundantAsk) {
      const nextQuestion = !answers.problem
        ? 'Cuéntame, ¿qué tema o problema te gustaría desarrollar en tu tesis?'
        : (!answers.field
          ? '¡Perfecto! ¿Y de qué carrera es tu tesis?'
          : (!answers.university ? '¡Perfecto! ¿Y en qué universidad estudias?' : null));

      this.logActivity({
        type: 'redundant_question_fixed',
        waId,
        asked: redundantAsk,
        original: result.reply,
        replacement: nextQuestion
      });

      if (nextQuestion) result.reply = nextQuestion;
      else result.ready = true;
    }

    // Pedir la reunión gana sobre cualquier dato que falte: si el contacto ya
    // dijo que quiere agendar (o propuso un día y una hora), se pasa a
    // agendar de inmediato. Los datos que no dio se completan con los valores
    // por defecto del panel y el jefe comercial los ve en la reunión;
    // insistir con más preguntas a alguien que ya dijo "quiero reunirme" es
    // la forma más rápida de perderlo.
    const missingAcademic = !answers.field ? 'field' : (!answers.university ? 'university' : null);
    if (result.schedulingIntent) {
      this.logActivity({ type: 'scheduling_fast_track', waId, text: incomingText, when: answers.__when || null });
      await this.finalize(waId, answers);
    } else if (result.ready && answers.problem && !missingAcademic) {
      // Si el contacto aprovechó el mensaje que completó los datos para
      // preguntar algo ("UNMSM. ¿Cuánto dura la reunión?"), la respuesta va
      // dentro de `result.reply` y se perdería, porque offerScheduling() manda
      // su propio texto. Se envía primero, pero SOLO si de verdad preguntó
      // algo: si no, `reply` es un acuse ("Perfecto 👀") o un anuncio del tipo
      // "vamos a agendar la reunión" que duplicaría el mensaje siguiente.
      const closingNote = (result.reply || '').trim();
      const askedSomething = /[?¿]/.test(incomingText || '');
      if (askedSomething && closingNote.length > 30 && !/[?¿]/.test(closingNote)) {
        await this.send(waId, closingNote);
      }
      await this.finalize(waId, answers);
    } else if (result.ready && answers.problem && missingAcademic) {
      // El LLM quiso cerrar sin todos los datos: se pide el que falte.
      await this.send(waId, missingAcademic === 'field'
        ? 'Perfecto 🙌 Antes de coordinar la reunión, cuéntame: ¿de qué carrera es tu tesis?'
        : 'Perfecto 🙌 Una última cosa antes de coordinar la reunión: ¿en qué universidad estudias?');
    } else {
      await this.send(waId, result.reply);
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
    const university = answers.university || null;
    const email = answers.email || '';

    const synthesizedTopic = `${problem}: Caso de estudio y propuesta en ${location}`;
    const additionalNotes = `Problema: ${problem} | Ámbito: ${location}` +
      (answers.field ? ` | Carrera: ${answers.field}` : '') +
      (university ? ` | Universidad: ${university}` : '') +
      ' | Origen: WhatsApp (Avan, bot automático)';

    // Antes había aquí un mensaje intro largo ("¡Genial! Con lo que me
    // cuentas...") que además duplicaba el "dame un momento" del LLM. Se
    // eliminó: el turno ya cerró con una respuesta breve y offerScheduling()
    // hace la siguiente pregunta directamente.

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
    if (university) leadPayload.university = university;

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

    await this.offerScheduling(waId, { topic: synthesizedTopic, email, when: answers.__when || null });
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
    await this.send(waId, 'El jefe comercial se pondrá en contacto contigo pronto para coordinar la reunión. ¡Gracias! 🙌');
  }

  /**
   * Tras conocer el tema, arranca el agendamiento: valida que el calendario
   * del asesor esté disponible y le pregunta al lead la MODALIDAD de la
   * llamada (telefónica o por Google Meet, con descuento). Según lo que elija se le
   * pide su número o su correo, y recién después se pasa a elegir día y hora.
   * Si Calendar no está listo o no hay bloques libres, se transfiere a
   * seguimiento manual sin bloquear la conversación.
   */
  async offerScheduling(waId, { topic, email, when = null }) {
    try {
      if (!this.googleCalendarService?.isConfigured()) throw new Error('Google Calendar no configurado en el servidor');

      const connection = await this.googleCalendarService.getConnection(BOOKING_ADVISOR_USER_ID);
      if (!connection) throw new Error('El asesor por defecto no tiene Google Calendar conectado');

      const preview = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID, { limit: 1, days: BOOKING_WINDOW_DAYS });
      if (preview.length === 0) throw new Error(`Sin bloques libres en los próximos ${MAX_BOOKING_DAYS_AHEAD} días`);

      const session = await this.getSession(waId);
      const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
      answers.__scheduling = { topic, email: email || null, mode: null, phone: null, discount: 0, when: when || answers.__when || null };
      await this.updateSession(waId, { status: 'scheduling_mode', answers: JSON.stringify(answers) });

      await this.send(waId, `Coordinemos una reunión con nuestro jefe comercial para revisar tu tema 🙌 ¿Cómo prefieres la llamada?\n\n1. Telefónica\n2. Vía Google Meet (con ${MEET_DISCOUNT_PCT}% de descuento)`);
    } catch (error) {
      // Si la conexión de Google Calendar del asesor caducó, avisar al equipo
      // en el panel para que la reconecte — si no, todos los leads que
      // lleguen a este punto se transfieren a mano en silencio.
      if (error.code === 'GOOGLE_RECONNECT_REQUIRED' && this.notificationService) {
        try {
          await this.notificationService.create({
            type: 'google_calendar_disconnected',
            title: 'Reconecta el Google Calendar del asesor',
            body: 'Avan no pudo ofrecer agendar una llamada: la conexión de Google Calendar caducó. Reconéctala en "Disponibilidad".',
            link: '/admin/availability'
          });
        } catch (notifyError) {
          console.error('❌ [WhatsApp Bot] Error al crear la notificación de Google Calendar desconectado:', notifyError);
        }
      }
      await this.handOffToAdvisor(waId, error.message);
    }
  }

  /**
   * Describe el paso de agendamiento en curso: `question` es lo que se le
   * acaba de preguntar al contacto (contexto para el clasificador), y
   * `restate` el mensaje con el que se retoma ese paso después de haberle
   * respondido una pregunta suelta.
   */
  _describeSchedulingStep(status, scheduling = {}) {
    switch (status) {
      case 'scheduling_mode':
        return {
          question: `¿Cómo prefieres la llamada? 1. Telefónica / 2. Vía Google Meet (con ${MEET_DISCOUNT_PCT}% de descuento)`,
          restate: `Volviendo a lo nuestro: ¿cómo prefieres la llamada?\n\n1. Telefónica\n2. Vía Google Meet (con ${MEET_DISCOUNT_PCT}% de descuento)`
        };
      case 'scheduling_phone':
        return {
          question: '¿A qué número te llamamos, con código de país?',
          restate: 'Y volviendo a la llamada: ¿a qué número te marcamos? (con código de país, ej: 51987654321)'
        };
      case 'scheduling_email':
        return {
          question: '¿A qué correo te envío el link de Google Meet?',
          restate: 'Y para mandarte el link de Google Meet, ¿a qué correo te lo envío?'
        };
      case 'scheduling_date': {
        const phrase = this._availableDaysPhrase(scheduling.availableDays || []) || 'los próximos días';
        return {
          question: `¿Qué día prefieres para la llamada? Los días con agenda disponible son: ${phrase}.`,
          restate: `Volviendo a la agenda: tenemos ${phrase}. ¿Qué día prefieres?`
        };
      }
      case 'scheduling_time': {
        const list = numberedList(slotOptionLabels(scheduling.slots));
        return {
          question: `¿Cuál de estos horarios prefieres?\n${list}`,
          restate: `Volviendo a los horarios:\n\n${list}\n\nResponde con el número que prefieras, o "no" si prefieres que te contacten después.`
        };
      }
      default:
        return { question: '', restate: '' };
    }
  }

  /**
   * Puerta de entrada a los pasos de agendamiento. Antes de que la máquina de
   * estados intente extraer su dato, se revisa si el contacto además hizo una
   * PREGUNTA (cuánto dura la reunión, cuánto cuesta, qué incluye). Sin esto,
   * cualquier pregunta hecha durante el agendamiento se perdía en silencio —
   * o peor, se interpretaba como un dato inválido ("No parece un correo
   * válido 🤔" ante un "¿qué tiempo demora la reunión?").
   *
   * Tres desenlaces:
   *   - No hay pregunta aparte → el paso sigue exactamente como antes.
   *   - Pregunta + el dato del paso → se responde y el paso continúa.
   *   - Solo pregunta → se responde y se retoma el paso en el mismo mensaje,
   *     sin cambiar de estado ni tratar el texto como un dato inválido.
   */
  async handleSchedulingTurn(waId, session, text) {
    const { scheduling } = this._readScheduling(session);
    const trimmed = (text || '').trim();

    // Casos que la máquina de estados ya resuelve bien por sí sola: no se
    // gasta una llamada al LLM en ellos.
    if (!scheduling || this._isSchedulingRefusal(trimmed) || isObviousStepAnswer(session.status, trimmed)) {
      return this.dispatchByStatus(waId, text);
    }

    const step = this._describeSchedulingStep(session.status, scheduling);

    let aside;
    try {
      const settings = await this.settingsService.get();
      const lead = await this.leadService.findByPhone(waId);
      aside = await this.ollamaService.classifySchedulingAside(trimmed, {
        stepQuestion: step.question,
        knowledgeBlock: buildKnowledgeBlock(settings),
        contactName: firstNameOf(lead?.full_name)
      });
    } catch (error) {
      // Que falle la respuesta a una duda no puede tumbar el agendamiento.
      this.logActivity({ type: 'scheduling_aside_failed', waId, text, error: error.message });
      return this.dispatchByStatus(waId, text);
    }

    this.logActivity({
      type: 'scheduling_aside',
      waId,
      text,
      status: session.status,
      isAside: aside.isAside,
      answersStep: aside.answersStep,
      preferredWhen: aside.preferredWhen,
      answer: aside.answer,
      source: aside.source
    });

    // El contacto puede decir cuándo quiere la reunión en cualquiera de los
    // pasos previos a elegir el día ("via meet para las 3 de la tarde hoy"):
    // se guarda para que promptForDate no se lo vuelva a preguntar. En los
    // pasos de día y hora no hace falta, porque ahí el mensaje YA es la
    // respuesta y lo interpretan sus propios handlers.
    if (aside.preferredWhen && !['scheduling_date', 'scheduling_time'].includes(session.status)) {
      const { answers } = this._readScheduling(session);
      answers.__scheduling.when = aside.preferredWhen;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      this.logActivity({ type: 'preferred_when_captured', waId, status: session.status, when: aside.preferredWhen });
    }

    if (!aside.isAside) return this.dispatchByStatus(waId, text);

    if (aside.answersStep) {
      // Respondió la pregunta Y dio el dato: se le contesta y el handler del
      // paso manda por su cuenta el siguiente mensaje del flujo.
      await this.send(waId, aside.answer);
      return this.dispatchByStatus(waId, text);
    }

    // Solo preguntó: respuesta + el paso retomado en un único mensaje, para
    // no partir en dos burbujas algo que en una conversación real va junto.
    await this.send(waId, step.restate ? `${aside.answer}\n\n${step.restate}` : aside.answer);
  }

  /** Utilidad: lee `answers.__scheduling` de la sesión (o null si no existe). */
  _readScheduling(session) {
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});
    return { answers, scheduling: answers.__scheduling || null };
  }

  /** Frase común que aborta el agendamiento si el lead dice "no"/"después". */
  _isSchedulingRefusal(text) {
    return ['no', 'omitir', 'despues', 'después', 'luego', 'mas tarde', 'más tarde'].includes(normalize((text || '').trim()));
  }

  /**
   * Pasa al paso de agendamiento consultando la disponibilidad REAL del
   * asesor. Si solo hay un día con espacio, NO pregunta el día: pasa directo
   * a ofrecer los horarios de ese día. Si hay varios, pregunta cuál prefiere.
   */
  async promptForDate(waId) {
    const upcoming = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID, { limit: 30, days: BOOKING_WINDOW_DAYS });
    const days = [...new Set(upcoming.map((s) => s.date))].sort();

    const { answers, scheduling } = this._readScheduling(await this.getSession(waId));

    if (days.length === 0) {
      // Entre la comprobación de offerScheduling y este punto se ocupó la
      // última franja: se transfiere a un asesor en vez de dejarlo colgado.
      if (scheduling) delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'Sin bloques libres al momento de proponer el día.');
      return;
    }

    if (scheduling) scheduling.availableDays = days;

    // El contacto ya dijo cuándo quiere la reunión durante la conversación
    // ("¿puedo tener la reunión a las 5 hoy?"). Volver a preguntarle el día
    // después de eso es lo que más molesta: se interpreta lo que dijo y, si
    // ese día tiene espacio, se salta directo a los horarios más cercanos a
    // la hora que pidió. Se consume una sola vez.
    if (scheduling?.when) {
      const requested = scheduling.when;
      delete scheduling.when;
      try {
        const { date, preferredTime } = await this.ollamaService.parseSchedulingDate(requested, limaTodayIso(), MAX_BOOKING_DAYS_AHEAD);

        // Puede haber dicho el día ("hoy a las 5"), solo la hora ("a las 5
        // porfa") o solo el día. Si solo dijo la hora, se asume el primer día
        // con agenda —hoy, si tiene espacio—, que es lo que espera alguien
        // que pide una reunión "a las 5" sin más.
        const explicitDate = date && days.includes(date) ? date : null;
        const targetDate = explicitDate || (preferredTime ? days[0] : null);

        if (targetDate) {
          const slots = await this.googleCalendarService.getFreeSlotsForDate(BOOKING_ADVISOR_USER_ID, targetDate, { limit: SLOTS_TO_OFFER, nearTime: preferredTime });
          if (slots.length > 0) {
            // La hora exacta que pidió está libre: no tiene sentido ofrecerle
            // una lista para que vuelva a elegir lo que ya eligió. Se agenda.
            const exact = preferredTime ? slots.find((slot) => limaTimeOf(slot.startTime) === preferredTime) : null;
            if (exact) {
              await this.updateSession(waId, { answers: JSON.stringify(answers) });
              this.logActivity({ type: 'exact_time_booked', waId, when: requested, slot: exact.label });
              await this.confirmSlot(waId, exact);
              return;
            }

            let intro;
            if (!preferredTime) {
              intro = `📅 Perfecto, para ${dayLabelWithArticle(targetDate)} tengo:`;
            } else if (explicitDate) {
              intro = `A las ${formatClockLabel(preferredTime)} no tengo libre ${dayLabelWithArticle(targetDate)} 🙈 Estos son los más cercanos:`;
            } else {
              intro = `A las ${formatClockLabel(preferredTime)} no tengo libre 🙈 Lo más cercano que tengo para ${dayLabelWithArticle(targetDate)}:`;
            }

            scheduling.slots = slots;
            await this.updateSession(waId, { status: 'scheduling_time', answers: JSON.stringify(answers) });
            await this.send(
              waId,
              `${intro}\n\n${numberedList(slotOptionLabels(slots))}\n\n` +
              'Responde con el número que prefieras, o "no" si prefieres que te contacten después.'
            );
            return;
          }
        }
      } catch (error) {
        // Si no se pudo interpretar, se sigue por el camino normal.
        this.logActivity({ type: 'preferred_when_failed', waId, when: requested, error: error.message });
      }
    }

    // Un solo día disponible → sin rodeos: se muestran los horarios de una vez.
    if (days.length === 1) {
      const day = days[0];
      const slots = upcoming.filter((s) => s.date === day).slice(0, SLOTS_TO_OFFER);
      if (scheduling) scheduling.slots = slots;
      await this.updateSession(waId, { status: 'scheduling_time', answers: JSON.stringify(answers) });
      await this.send(
        waId,
        `📅 Tenemos agenda para ${dayLabelWithArticle(day)}. Estos son los horarios:\n\n` +
        `${numberedList(slotOptionLabels(slots))}\n\n` +
        'Responde con el número que prefieras, o "no" si prefieres que te contacten después.'
      );
      return;
    }

    // Varios días → se pregunta cuál prefiere.
    await this.updateSession(waId, { status: 'scheduling_date', answers: JSON.stringify(answers) });
    await this.send(
      waId,
      `📅 Tenemos agenda disponible: ${this._availableDaysPhrase(days)}. ¿Qué día prefieres para la llamada con el jefe comercial?`
    );
  }

  /**
   * Elección de modalidad: 1 = telefónica, 2 = por Meet (con descuento). Si
   * elige telefónica y no tenemos su número (contacto identificado solo por
   * BSUID de Instagram/Facebook), se le pide. Si elige Meet y no dio su
   * correo, se le pide.
   */
  async handleSchedulingModeReply(waId, session, text) {
    const { answers, scheduling } = this._readScheduling(session);
    if (!scheduling) { await this.updateSession(waId, { status: 'completed' }); return; }

    if (this._isSchedulingRefusal(text)) {
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'El lead prefirió no agendar.');
      return;
    }

    const mode = parseCallMode(text);
    if (!mode) {
      await this.send(waId, `Responde *1* para llamada telefónica, o *2* para Google Meet (con ${MEET_DISCOUNT_PCT}% de descuento).`);
      return;
    }

    scheduling.mode = mode;
    scheduling.discount = mode === 'meet' ? MEET_DISCOUNT_PCT : 0;

    if (mode === 'phone') {
      if (waIdIsPhone(waId)) {
        scheduling.phone = digitsOnly(waId);
        await this.updateSession(waId, { answers: JSON.stringify(answers) });
        await this.promptForDate(waId);
      } else {
        await this.updateSession(waId, { status: 'scheduling_phone', answers: JSON.stringify(answers) });
        await this.send(waId, 'Perfecto 📞 ¿A qué número te llamamos? (con código de país, ej: 51987654321)');
      }
      return;
    }

    // mode === 'meet'
    if (looksLikeEmail(scheduling.email)) {
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.promptForDate(waId);
    } else {
      await this.updateSession(waId, { status: 'scheduling_email', answers: JSON.stringify(answers) });
      await this.send(waId, `Perfecto, aplico el ${MEET_DISCOUNT_PCT}% de descuento ✉️ ¿A qué correo te envío el link de Google Meet?`);
    }
  }

  /** Captura el número de teléfono para la llamada telefónica. */
  async handleSchedulingPhoneReply(waId, session, text) {
    const { answers, scheduling } = this._readScheduling(session);
    if (!scheduling) { await this.updateSession(waId, { status: 'completed' }); return; }

    if (this._isSchedulingRefusal(text)) {
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'El lead no quiso dejar su número.');
      return;
    }

    if (!looksLikePhone(text)) {
      await this.send(waId, 'No reconocí el número 🤔 Pásamelo con el código de país (ej: 51987654321).');
      return;
    }

    scheduling.phone = digitsOnly(text);
    await this.updateSession(waId, { answers: JSON.stringify(answers) });
    await this.promptForDate(waId);
  }

  /** Captura el correo para enviar el link de Google Meet. */
  async handleSchedulingEmailReply(waId, session, text) {
    const { answers, scheduling } = this._readScheduling(session);
    if (!scheduling) { await this.updateSession(waId, { status: 'completed' }); return; }

    const trimmed = (text || '').trim();
    const foundEmail = extractEmail(trimmed);

    if (foundEmail) {
      scheduling.email = foundEmail;
    } else if (this._isSchedulingRefusal(trimmed) || normalize(trimmed).includes('no tengo')) {
      // Sigue sin correo: el link de Google Meet se le manda por acá mismo.
    } else {
      scheduling.emailAttempts = (scheduling.emailAttempts || 0) + 1;
      if (scheduling.emailAttempts < 2) {
        await this.updateSession(waId, { answers: JSON.stringify(answers) });
        await this.send(waId, 'No parece un correo válido 🤔 ¿me lo confirmas? (ej: nombre@correo.com)');
        return;
      }
      // Tras 2 intentos fallidos, se continúa sin correo.
    }

    await this.updateSession(waId, { answers: JSON.stringify(answers) });
    await this.promptForDate(waId);
  }

  /** Frase legible con los días que sí tienen espacio (ej. "hoy y el viernes 28"). */
  _availableDaysPhrase(days) {
    const labels = (days || []).map(formatShortDayLabel);
    if (labels.length === 0) return '';
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  }

  /**
   * Interpreta con IA qué día pidió el lead. Solo se agenda en un día que de
   * verdad tenga espacio libre (los que se le nombraron al proponerle elegir);
   * si pide otro, se le recuerdan los días disponibles reales.
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

    const todayIso = limaTodayIso();

    // Días con espacio real. Se recalculan siempre (pudo cambiar la agenda) y
    // se guardan para no volver a consultar en cada intento.
    let availableDays = scheduling.availableDays;
    if (!availableDays || availableDays.length === 0) {
      const upcoming = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID, { limit: 30, days: BOOKING_WINDOW_DAYS });
      availableDays = [...new Set(upcoming.map((s) => s.date))].sort();
      scheduling.availableDays = availableDays;
    }

    if (availableDays.length === 0) {
      delete answers.__scheduling;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.handOffToAdvisor(waId, 'Sin bloques libres al procesar la fecha elegida.');
      return;
    }

    const daysPhrase = this._availableDaysPhrase(availableDays);
    // `preferredTime` recoge la hora que el lead dijo junto con el día ("hoy
    // a las 6 pm"). Antes se descartaba y se le ofrecían siempre los primeros
    // bloques del día, aunque la hora que pidió estuviera libre.
    const { date, preferredTime } = await this.ollamaService.parseSchedulingDate(trimmed, todayIso, MAX_BOOKING_DAYS_AHEAD);

    if (!date) {
      await this.send(waId, `No identifiqué el día 🤔 Tenemos agenda ${daysPhrase}. ¿Cuál prefieres?`);
      return;
    }

    if (!availableDays.includes(date)) {
      await this.send(waId, `Ese día no hay agenda 🙈 Tenemos ${daysPhrase}. ¿Cuál te viene bien?`);
      return;
    }

    const slots = await this.googleCalendarService.getFreeSlotsForDate(BOOKING_ADVISOR_USER_ID, date, { limit: SLOTS_TO_OFFER, nearTime: preferredTime });
    if (slots.length === 0) {
      // Se ocupó la última franja de ese día entre que se propuso y ahora.
      const fresh = await this.googleCalendarService.getUpcomingFreeSlots(BOOKING_ADVISOR_USER_ID, { limit: 30, days: BOOKING_WINDOW_DAYS });
      scheduling.availableDays = [...new Set(fresh.map((s) => s.date))].sort();
      if (scheduling.availableDays.length === 0) {
        delete answers.__scheduling;
        await this.updateSession(waId, { answers: JSON.stringify(answers) });
        await this.handOffToAdvisor(waId, 'Sin bloques libres tras pedirle una fecha al lead.');
        return;
      }
      await this.updateSession(waId, { status: 'scheduling_date', answers: JSON.stringify(answers) });
      await this.send(waId, `Justo se ocupó ese día 😅 Ahora tenemos ${this._availableDaysPhrase(scheduling.availableDays)}. ¿Cuál prefieres?`);
      return;
    }

    // Si dijo día Y hora y esa hora está libre, se agenda directo: pedirle que
    // elija de una lista lo que acaba de pedir es dar una vuelta de más.
    const exact = preferredTime ? slots.find((slot) => limaTimeOf(slot.startTime) === preferredTime) : null;
    if (exact) {
      scheduling.slots = slots;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      this.logActivity({ type: 'exact_time_booked', waId, when: trimmed, slot: exact.label });
      await this.confirmSlot(waId, exact);
      return;
    }

    // Si pidió una hora concreta y justo esa no está libre, se dice
    // explícitamente en vez de mandarle una lista que parece ignorarlo.
    const gotExactTime = !preferredTime;
    const intro = gotExactTime
      ? `📅 Horarios para ${dayLabelWithArticle(date)}:`
      : `A las ${formatClockLabel(preferredTime)} no tengo libre ese día 🙈 Estos son los más cercanos:`;

    scheduling.slots = slots;
    await this.updateSession(waId, { status: 'scheduling_time', answers: JSON.stringify(answers) });

    const list = numberedList(slotOptionLabels(slots));
    await this.send(waId, `${intro}\n\n${list}\n\nResponde con el número que prefieras, o "no" si prefieres que te contacten después.`);
  }

  /**
   * Procesa la elección de horario: un número válido crea el evento real en
   * Google Calendar (con link de Google Meet), lo registra en `scheduled_meetings`
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

    // Al LLM se le pasan las etiquetas completas (con fecha) para que pueda
    // interpretar "el de mañana"; al contacto se le muestran ya recortadas.
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
        const nearSlots = await this.googleCalendarService.getFreeSlotsNearTime(BOOKING_ADVISOR_USER_ID, preferredTime, { limit: SLOTS_TO_OFFER, days: BOOKING_WINDOW_DAYS });
        if (nearSlots.length > 0) {
          scheduling.slots = nearSlots;
          await this.updateSession(waId, { answers: JSON.stringify(answers) });
          await this.send(
            waId,
            `Ese horario no lo tengo libre, pero tengo estos más cercanos a lo que buscas:\n\n${numberedList(slotOptionLabels(nearSlots))}\n\nResponde con el número que prefieras, o "no" si prefieres que te contacten después.`
          );
          return;
        }
      }

      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.send(
        waId,
        `⚠️ No reconocí esa opción. Responde con el número del horario, o "no" si prefieres que te contacten después:\n\n${numberedList(slotOptionLabels(scheduling.slots))}`
      );
      return;
    }

    return this.confirmSlot(waId, slot);
  }

  /**
   * Crea la reunión real en el Google Calendar del asesor a partir de un
   * bloque ya elegido: registra el evento (con link de Google Meet), lo
   * guarda en `scheduled_meetings`, mueve el lead a "Cita Agendada" y le
   * confirma al contacto. Se llama tanto cuando elige un número de la lista
   * como cuando ya había dicho una hora exacta que estaba libre.
   */
  async confirmSlot(waId, slot) {
    const session = await this.getSession(waId);
    const { answers, scheduling } = this._readScheduling(session);
    if (!scheduling) { await this.updateSession(waId, { status: 'completed' }); return; }

    const isPhone = scheduling.mode === 'phone';
    const contactPhone = scheduling.phone || (waIdIsPhone(waId) ? digitsOnly(waId) : null);
    const modalidadLabel = isPhone ? 'Llamada telefónica' : 'Videollamada por Google Meet';
    const discountText = scheduling.discount ? ` | Descuento aplicado: ${scheduling.discount}%` : '';

    try {
      const event = await this.googleCalendarService.createMeetEvent(BOOKING_ADVISOR_USER_ID, {
        summary: `${isPhone ? '📞' : '💻'} Asesoría de tesis - ${scheduling.topic}`,
        description:
          `Agendada automáticamente por Avan (WhatsApp) con el contacto ${waId}.\n` +
          `Modalidad: ${modalidadLabel}${discountText}\n` +
          (isPhone && contactPhone ? `Teléfono del lead para la llamada: ${contactPhone}\n` : '') +
          (scheduling.email ? `Correo del lead: ${scheduling.email}\n` : ''),
        startTime: slot.startTime,
        endTime: slot.endTime,
        // Se vuelve a extraer por si la sesión venía de una versión anterior
        // que guardaba el mensaje completo: un invitado inválido hacía que
        // Google rechazara el evento y la reunión se perdiera.
        attendeeEmail: (!isPhone && extractEmail(scheduling.email)) || undefined
      });

      delete answers.__scheduling;
      await this.updateSession(waId, { status: 'completed', answers: JSON.stringify(answers) });

      const lead = await this.leadService.findByPhone(waId);
      if (lead) {
        const noteAppend = `\nReunión agendada (${isPhone ? 'telefónica' : 'Meet'}${scheduling.discount ? `, ${scheduling.discount}% dto` : ''}): ${slot.label}` +
          (isPhone && contactPhone ? ` — Tel: ${contactPhone}` : '') +
          (!isPhone && event.meetLink ? ` — ${event.meetLink}` : '');
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
            meetLink: isPhone ? null : event.meetLink,
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
            body: `${slot.label} — ${isPhone ? '📞 Telefónica' : '💻 Meet'}${scheduling.discount ? ` (${scheduling.discount}% dto)` : ''}${scheduling.topic ? ` — ${scheduling.topic}` : ''}`,
            link: '/admin/availability'
          });
        } catch (notifyError) {
          console.error(`❌ [WhatsApp Bot] Error al crear la notificación de reunión agendada para ${waId}:`, notifyError);
        }
      }

      await this.send(
        waId,
        `✅ ¡Listo${name ? `, ${name}` : ''}! Tu ${isPhone ? 'llamada telefónica' : 'reunión por Google Meet'} con el jefe comercial quedó agendada para *${slot.label}*.` +
        (isPhone
          ? `\n\n📞 Te llamaremos${contactPhone ? ` al ${contactPhone}` : ''}.`
          : (event.meetLink ? `\n\n🔗 Link de Google Meet: ${event.meetLink}` : '') +
            (scheduling.discount ? `\n\n🎁 Se aplicó ${scheduling.discount}% de descuento.` : '')) +
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
      .whereIn('status', ['active', ...SCHEDULING_STATUSES])
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
      .whereIn('status', ['active', ...SCHEDULING_STATUSES])
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

    const settings = await this.settingsService.get();
    const result = await this.ollamaService.classifyPostBookingMessage(text, {
      meetingLabel: formatMeetingDateTimeLabel(meeting.start_time),
      meetLink: meeting.meet_link,
      knowledgeBlock: buildKnowledgeBlock(settings),
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
