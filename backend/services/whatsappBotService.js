import { db } from '../db/connection.js';
import { WhatsappBotStepService } from './whatsappBotStepService.js';

// Rango de espera antes de cada mensaje automático (simula el tiempo de
// "escribiendo..." de una persona real y evita ráfagas de mensajes
// instantáneos que WhatsApp puede marcar como comportamiento de spam/bot,
// afectando la calidad del número o llevando a su restricción.
const BOT_DELAY_MIN_MS = Number(process.env.WHATSAPP_BOT_DELAY_MIN_MS) || 1500;
const BOT_DELAY_MAX_MS = Number(process.env.WHATSAPP_BOT_DELAY_MAX_MS) || 3500;

// Orden usado si una sesión antigua no tiene "step_sequence" guardado
// (creada antes de que el guion fuera configurable).
const LEGACY_STEP_ORDER = ['problem', 'location', 'level', 'field', 'email'];

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
 * Flujo conversacional automático de TesiBot por WhatsApp, guiado por el
 * guion editable en `whatsapp_bot_steps` (texto, orden y activo/inactivo
 * configurables desde el panel admin). Al finalizar, evalúa la viabilidad,
 * envía el reporte por correo (si se recogió un correo) y registra/actualiza
 * el lead en el funnel de ventas.
 */
export class WhatsappBotService {
  constructor({ ollamaService, emailService, leadService, whatsappMessageService, stepService }) {
    this.ollamaService = ollamaService;
    this.emailService = emailService;
    this.leadService = leadService;
    this.whatsappMessageService = whatsappMessageService;
    this.stepService = stepService || new WhatsappBotStepService();
    // wa_id -> { messages: string[], timer: NodeJS.Timeout }, buffer temporal
    // de los primeros mensajes de un contacto nuevo mientras se espera el
    // silencio de FIRST_MESSAGE_DEBOUNCE_MS antes de iniciar la sesión.
    this.pendingFirstMessages = new Map();
  }

  async getSession(waId) {
    return db('whatsapp_bot_sessions').where({ wa_id: waId }).first();
  }

  async updateSession(waId, data) {
    await db('whatsapp_bot_sessions').where({ wa_id: waId }).update({ ...data, updated_at: db.fn.now() });
  }

  async setBotEnabled(waId, enabled) {
    const existing = await this.getSession(waId);
    if (existing) {
      await this.updateSession(waId, { bot_enabled: enabled });
    } else {
      await db('whatsapp_bot_sessions').insert({ wa_id: waId, step: 0, status: 'active', bot_enabled: enabled, answers: JSON.stringify({}) });
    }
  }

  async send(waId, text) {
    await sleep(randomDelay());
    await this.whatsappMessageService.sendTextMessage(waId, text);
  }

  /**
   * Procesa un mensaje de texto entrante del flujo de TesiBot. Si el
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

    if (!session.bot_enabled || session.status === 'completed') return;

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

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this.pendingFirstMessages.delete(waId);
      this.startConversation(waId, pending.messages.join('\n')).catch((error) => {
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

    const welcome = await this.ollamaService.generateWelcomeMessage(joinedFirstMessage);
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
    const additionalNotes = `Problema: ${problem} | Ámbito: ${location} | Origen: WhatsApp (TesiBot automático)`;

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
        source: 'WhatsApp Directo'
      };

      const existingLead = await this.leadService.findByPhone(waId);
      if (existingLead) {
        await this.leadService.updateLead(existingLead.id, leadPayload);
      } else {
        await this.leadService.createLead({ ...leadPayload, phone: waId });
      }

      await this.updateSession(waId, { status: 'completed' });

      await this.send(
        waId,
        `✅ ¡Listo! Resultado de tu evaluación:\n\n📊 Viabilidad: ${evaluation.overallViabilityScore}% (${evaluation.viabilityLevel})\n\n` +
        (email
          ? `📩 Revisa tu correo (${email}) para ver el reporte completo con normativas SUNEDU/CONCYTEC.\n\n`
          : '') +
        'Un asesor se pondrá en contacto contigo pronto. ¡Gracias! 🙌'
      );
    } catch (error) {
      console.error('❌ [WhatsApp Bot] Error al finalizar la evaluación:', error);
      await this.updateSession(waId, { status: 'completed' });
      await this.send(waId, '⚠️ Tuvimos un problema técnico al generar tu reporte automático, pero ya registramos tus datos. Un asesor te contactará pronto para continuar. ¡Gracias! 🙌');
    }
  }
}
