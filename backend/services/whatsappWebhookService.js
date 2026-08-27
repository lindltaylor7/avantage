import crypto from 'crypto';
import { WhatsappMessageService, detectWhatsappChannel } from './whatsappMessageService.js';
import { LeadService } from './leadService.js';

const MAX_RECENT_EVENTS = 50;

/**
 * Recepción de eventos del webhook de WhatsApp Business Platform: mensajes
 * entrantes (campo "messages") y actualizaciones de estado de los mensajes
 * enviados (entregado/leído/fallido).
 */
export class WhatsappWebhookService {
  constructor({ botService } = {}) {
    this.messageService = new WhatsappMessageService();
    this.leadService = new LeadService();
    this.botService = botService || null;
    this.recentEvents = [];
  }

  recordEvent({ body, signatureValid, hasSecret }) {
    this.recentEvents.unshift({
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      signatureValid,
      hasSecret,
      body
    });
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.length = MAX_RECENT_EVENTS;
    }
  }

  getRecentEvents() {
    return this.recentEvents;
  }

  clearRecentEvents() {
    this.recentEvents = [];
  }

  /**
   * Valida el reto de verificación (GET) que envía Meta al configurar el webhook.
   */
  verifyChallenge(mode, token) {
    return mode === 'subscribe' && !!process.env.META_WHATSAPP_VERIFY_TOKEN && token === process.env.META_WHATSAPP_VERIFY_TOKEN;
  }

  /**
   * Valida la firma X-Hub-Signature-256 del payload (POST). Usa el mismo App
   * Secret que el resto de webhooks de la app (WhatsApp comparte la app de Meta).
   */
  verifySignature(rawBody, signatureHeader) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret || !rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = signatureHeader.slice('sha256='.length);

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Procesa una entrada ("entry") del payload: guarda cada mensaje entrante y
   * actualiza el estado (enviado/entregado/leído/fallido) de los salientes.
   */
  async handleEntry(entry) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};

      for (const message of value.messages || []) {
        const senderId = message.from || message.from_user_id;
        if (!senderId) continue;

        try {
          const { isNew } = await this.messageService.createFromMessage(value, message);

          // Se crea/actualiza el lead tanto si el remitente compartió un
          // número real ("from") como si solo viene identificado por un
          // Business-Scoped User ID ("from_user_id" — típico de alguien que
          // escribió tras tocar "Enviar mensaje" en un anuncio o publicación
          // de Instagram/Facebook sin compartir su número). El "phone" del
          // lead queda con ese mismo identificador; sendTextMessage() ya
          // sabe responderle a un BSUID vía el campo "recipient" de la Graph
          // API, así que excluirlo aquí solo dejaba a esos leads sin bot.
          const contact = (value.contacts || []).find((c) => (c.wa_id || c.user_id) === senderId);
          await this.leadService.findOrCreateFromWhatsApp({
            phone: senderId,
            fullName: contact?.profile?.name,
            source: detectWhatsappChannel(message.referral)
          });

          // Solo ante mensajes de texto, y solo si el mensaje es realmente
          // nuevo (Meta puede reenviar el mismo evento por reintentos; sin
          // este chequeo el bot procesaría el mismo mensaje dos veces).
          if (isNew && this.botService && message.type === 'text' && message.text?.body) {
            await this.botService.handleIncomingMessage(senderId, message.text.body, message.id);
          }
        } catch (error) {
          console.error(`❌ [WhatsApp Webhook] Error al guardar el mensaje ${message.id}:`, error);
        }
      }

      for (const status of value.statuses || []) {
        const statusError = (status.errors || [])
          .map((e) => `[${e.code}] ${e.title}${e.error_data?.details ? `: ${e.error_data.details}` : ''}`)
          .join(' | ') || null;

        console.log(`📶 [WhatsApp Webhook] Actualización de estado: mensaje ${status.id} → ${status.status}${statusError ? ` (${statusError})` : ''}`);
        try {
          await this.messageService.updateStatus(status.id, status.status, statusError);
        } catch (error) {
          console.error(`❌ [WhatsApp Webhook] Error al actualizar el estado del mensaje ${status.id}:`, error);
        }
      }
    }
  }
}
