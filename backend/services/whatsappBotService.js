import { db } from '../db/connection.js';

// Rango de espera antes de cada mensaje automático (simula el tiempo de
// "escribiendo..." de una persona real y evita ráfagas de mensajes
// instantáneos que WhatsApp puede marcar como comportamiento de spam/bot,
// afectando la calidad del número o llevando a su restricción.
const BOT_DELAY_MIN_MS = Number(process.env.WHATSAPP_BOT_DELAY_MIN_MS) || 1500;
const BOT_DELAY_MAX_MS = Number(process.env.WHATSAPP_BOT_DELAY_MAX_MS) || 3500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return BOT_DELAY_MIN_MS + Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS);
}

const ACADEMIC_LEVELS = [
  'Pregrado (Bachiller/Título)',
  'Posgrado (Maestría)',
  'Posgrado (Doctorado)'
];

const FIELDS_OF_STUDY = [
  'Ingeniería de Sistemas y Computación',
  'Ingeniería Agrónoma y Agroindustrial',
  'Ciencias de la Salud y Medicina',
  'Administración, Negocios y Finanzas',
  'Derecho y Ciencias Políticas',
  'Educación y Psicología',
  'Ingeniería de Minas y Geología',
  'Ingeniería Ambiental y Ecología'
];

const GREETING = '¡Hola! 👋 Soy TesiBot Perú, tu asistente académico con inteligencia artificial.\n\n' +
  'Voy a hacerte algunas preguntas breves para formular y evaluar la viabilidad de tu tema de tesis en Perú.\n\n' +
  '📌 *Pregunta 1:* ¿Cuál es el problema, tecnología o tema principal que deseas investigar?';

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

/**
 * Flujo conversacional automático de TesiBot por WhatsApp: replica las
 * mismas 5 preguntas de ThesisChatbot.vue (sin pedir el celular, porque ya
 * se conoce por ser el número de WhatsApp que escribe) y, al finalizar,
 * evalúa la viabilidad, envía el reporte por correo y registra/actualiza el
 * lead en el funnel de ventas.
 */
export class WhatsappBotService {
  constructor({ ollamaService, emailService, leadService, whatsappMessageService }) {
    this.ollamaService = ollamaService;
    this.emailService = emailService;
    this.leadService = leadService;
    this.whatsappMessageService = whatsappMessageService;
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
   * contacto no tiene sesión, la inicia con el saludo y la primera pregunta.
   */
  async handleIncomingMessage(waId, text) {
    const session = await this.getSession(waId);

    if (!session) {
      await db('whatsapp_bot_sessions').insert({ wa_id: waId, step: 1, status: 'active', bot_enabled: true, answers: JSON.stringify({}) });
      await this.send(waId, GREETING);
      return;
    }

    if (!session.bot_enabled || session.status === 'completed') return;

    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : (session.answers || {});

    if (session.step === 1) {
      answers.problem = (text || '').trim();
      await this.updateSession(waId, { step: 2, answers: JSON.stringify(answers) });
      await this.send(
        waId,
        '¡Excelente tema! 💡\n\n📌 *Pregunta 2:* ¿En qué lugar, institución, región o sector específico de Perú planeas enfocar el estudio?\n' +
        '(Ejemplo: "Región Ica", "Unidades mineras en Junín", "MYPEs de Gamarra")'
      );
      return;
    }

    if (session.step === 2) {
      answers.location = (text || '').trim();
      await this.updateSession(waId, { step: 3, answers: JSON.stringify(answers) });
      await this.send(
        waId,
        `Muy bien, delimitado a: ${answers.location}.\n\n📌 *Pregunta 3:* ¿Cuál es tu nivel académico? Responde con el número:\n\n${numberedList(ACADEMIC_LEVELS)}`
      );
      return;
    }

    if (session.step === 3) {
      const level = parseChoice(text, ACADEMIC_LEVELS);
      if (!level) {
        await this.send(waId, `⚠️ No reconocí esa opción. Responde solo con el número (1-${ACADEMIC_LEVELS.length}):\n\n${numberedList(ACADEMIC_LEVELS)}`);
        return;
      }
      answers.level = level;
      await this.updateSession(waId, { step: 4, answers: JSON.stringify(answers) });
      await this.send(
        waId,
        `Entendido 👍.\n\n📌 *Pregunta 4:* ¿A qué carrera perteneces? Responde con el número:\n\n${numberedList(FIELDS_OF_STUDY)}`
      );
      return;
    }

    if (session.step === 4) {
      const field = parseChoice(text, FIELDS_OF_STUDY);
      if (!field) {
        await this.send(waId, `⚠️ No reconocí esa opción. Responde solo con el número (1-${FIELDS_OF_STUDY.length}):\n\n${numberedList(FIELDS_OF_STUDY)}`);
        return;
      }
      answers.field = field;
      await this.updateSession(waId, { step: 5, answers: JSON.stringify(answers) });
      await this.send(waId, 'Perfecto 👍.\n\n📌 *Pregunta 5 (última):* ¿A qué correo electrónico deseas que te enviemos el Reporte Completo de Viabilidad?');
      return;
    }

    if (session.step === 5) {
      const email = (text || '').trim();
      if (!email.includes('@')) {
        await this.send(waId, '⚠️ Por favor ingresa un correo electrónico válido (ejemplo: usuario@gmail.com).');
        return;
      }
      answers.email = email;
      await this.updateSession(waId, { answers: JSON.stringify(answers) });
      await this.finalize(waId, answers);
    }
  }

  /**
   * Evalúa la viabilidad con IA, envía el reporte por correo y crea/actualiza
   * el lead correspondiente en el funnel de ventas.
   */
  async finalize(waId, answers) {
    const synthesizedTopic = `${answers.problem}: Caso de estudio y propuesta en ${answers.location}`;
    const additionalNotes = `Problema: ${answers.problem} | Ámbito: ${answers.location} | Origen: WhatsApp (TesiBot automático)`;

    await this.send(
      waId,
      `🎉 ¡Perfecto! He formulado tu propuesta:\n\n📜 "${synthesizedTopic}"\n\n🎓 Nivel: ${answers.level}\n🏛️ Carrera: ${answers.field}\n📩 Te enviaré el reporte completo a: ${answers.email}\n\n🧠 Estoy evaluando la viabilidad con IA, dame un momento...`
    );

    try {
      const reportData = await this.ollamaService.evaluateThesisViability({
        topic: synthesizedTopic,
        academicLevel: answers.level,
        fieldOfStudy: answers.field,
        additionalNotes
      });

      const emailStatus = await this.emailService.sendReportEmail(answers.email, reportData);
      if (!emailStatus.success) {
        console.warn(`⚠️ [WhatsApp Bot] El correo a ${answers.email} no se pudo confirmar como enviado.`);
      }

      const evaluation = reportData.evaluation;
      const leadPayload = {
        topic: synthesizedTopic,
        academicLevel: answers.level,
        fieldOfStudy: answers.field,
        email: answers.email,
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
        `📩 Revisa tu correo (${answers.email}) para ver el reporte completo con normativas SUNEDU/CONCYTEC.\n\nUn asesor se pondrá en contacto contigo pronto. ¡Gracias! 🙌`
      );
    } catch (error) {
      console.error('❌ [WhatsApp Bot] Error al finalizar la evaluación:', error);
      await this.updateSession(waId, { status: 'completed' });
      await this.send(waId, '⚠️ Tuvimos un problema técnico al generar tu reporte automático, pero ya registramos tus datos. Un asesor te contactará pronto para continuar. ¡Gracias! 🙌');
    }
  }
}
