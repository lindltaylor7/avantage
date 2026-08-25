import { db } from '../db/connection.js';

/**
 * Guion editable de las preguntas de Avan por WhatsApp: texto, orden,
 * activo/inactivo, opciones (para preguntas de selección) y valor por
 * defecto a usar cuando una pregunta está desactivada.
 */
export class WhatsappBotStepService {
  async getAll() {
    const steps = await db('whatsapp_bot_steps').orderBy('step_order');
    return steps.map(this.parseStep);
  }

  async getActiveOrdered() {
    const steps = await db('whatsapp_bot_steps').where({ active: true }).orderBy('step_order');
    return steps.map(this.parseStep);
  }

  async getByKey(stepKey) {
    const step = await db('whatsapp_bot_steps').where({ step_key: stepKey }).first();
    return step ? this.parseStep(step) : null;
  }

  parseStep(step) {
    return {
      ...step,
      options: typeof step.options === 'string' ? JSON.parse(step.options) : step.options
    };
  }

  /**
   * Reemplaza texto, tipo de opciones, activo/inactivo, valor por defecto y
   * orden de todas las preguntas de una vez (guardado tipo "foto completa"
   * desde la pantalla de edición del guion).
   */
  async saveAll(steps) {
    await db.transaction(async (trx) => {
      for (const [index, step] of steps.entries()) {
        await trx('whatsapp_bot_steps')
          .where({ step_key: step.stepKey })
          .update({
            step_order: index + 1,
            question_text: step.questionText,
            options: step.options ? JSON.stringify(step.options) : null,
            active: !!step.active,
            default_value: step.defaultValue ?? ''
          });
      }
    });
    return this.getAll();
  }
}
