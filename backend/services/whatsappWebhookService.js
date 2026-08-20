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
  constructor() {
    this.messageService = new WhatsappMessageService();
    this.leadService = new LeadService();
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
        if (!message.from) continue;

        try {
          await this.messageService.createFromMessage(value, message);

          const contact = (value.contacts || []).find((c) => c.wa_id === message.from);
          await this.leadService.findOrCreateFromWhatsApp({
            phone: message.from,
            fullName: contact?.profile?.name,
            source: detectWhatsappChannel(message.referral)
          });
        } catch (error) {
          console.error(`❌ [WhatsApp Webhook] Error al guardar el mensaje ${message.id}:`, error);
        }
      }

      for (const status of value.statuses || []) {
        console.log(`📶 [WhatsApp Webhook] Actualización de estado: mensaje ${status.id} → ${status.status}`);
        try {
          await this.messageService.updateStatus(status.id, status.status);
        } catch (error) {
          console.error(`❌ [WhatsApp Webhook] Error al actualizar el estado del mensaje ${status.id}:`, error);
        }
      }
    }
  }
}
