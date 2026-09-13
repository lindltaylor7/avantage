import crypto from 'crypto';
import { WhatsappMessageService } from './whatsappMessageService.js';
import { LeadService } from './leadService.js';

const MAX_RECENT_EVENTS = 50;

// En modo coexistencia (número vinculado también a la app de WhatsApp
// Business del celular), YCloud puede reenviar como
// "whatsapp.inbound_message.received" mensajes viejos del historial del
// teléfono al sincronizar — no solo mensajes que el contacto acaba de
// escribir. Si se procesaran igual como disparador del bot, este le
// respondería (o le borraría el recordatorio de inactividad ya mandado,
// nudge_sent_at) a partir de un mensaje de hace rato, sin que el contacto
// haya escrito nada de verdad. Se descarta como disparador cualquier mensaje
// cuyo "sendTime" real sea más viejo que esta ventana (igual se guarda en el
// historial de mensajes).
const COEXISTENCE_SYNC_MAX_AGE_MS = 2 * 60 * 1000;

/**
 * Recepción de eventos del webhook de YCloud: proveedor de WhatsApp Business
 * Platform usado en modo coexistencia cuando el número se vinculó por YCloud
 * en vez de completar el alta como Tech Provider de Meta (ver
 * WHATSAPP_PROVIDER en whatsappMessageService.js). A diferencia del webhook
 * nativo de Meta, YCloud no usa el formato "entry/changes/value" de la Graph
 * API: envuelve cada evento en un objeto propio {id, type, ...}.
 * https://docs.ycloud.com/reference/webhook-integration-guide
 */
export class YCloudWebhookService {
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
   * Valida la firma "YCloud-Signature: t={timestamp},s={signature}" de cada
   * evento con el secret generado al crear el endpoint (dashboard.ycloud.com
   * > Developer > Webhooks). Payload firmado: "{timestamp}.{rawBody}" (sin
   * punto final).
   * https://docs.ycloud.com/reference/webhook-integration-guide
   */
  verifySignature(rawBody, signatureHeader) {
    const secret = process.env.YCLOUD_WEBHOOK_SECRET;
    if (!secret || !rawBody || !signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => part.trim().split('='))
    );
    const { t: timestamp, s: signature } = parts;
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Despacha un evento del webhook según su "type": mensaje entrante o
   * actualización de estado de un mensaje saliente. Mismo pipeline
   * (lead + bot) que WhatsappWebhookService, adaptado al payload de YCloud.
   */
  async handleEvent(event) {
    if (event?.type === 'whatsapp.inbound_message.received') {
      await this.handleInboundMessage(event.whatsappInboundMessage || {});
    } else if (event?.type === 'whatsapp.message.updated') {
      await this.handleStatusUpdate(event.whatsappMessage || {});
    }
  }

  async handleInboundMessage(message) {
    const senderId = message.from;
    if (!senderId) return;

    const sentAt = message.sendTime ? new Date(message.sendTime) : new Date();
    const isFreshMessage = Date.now() - sentAt.getTime() <= COEXISTENCE_SYNC_MAX_AGE_MS;

    try {
      const { isNew } = await this.messageService.recordInboundMessage({
        waId: senderId,
        contactName: message.customerProfile?.name,
        messageId: message.wamid,
        messageType: message.type,
        body: message.text?.body || '',
        // YCloud no reenvía el "referral" de anuncios de Meta que sí trae el
        // webhook nativo — no hay forma de distinguir el canal de origen aquí.
        channel: 'WhatsApp Directo',
        receivedAt: sentAt,
        rawPayload: message
      });

      await this.leadService.findOrCreateFromWhatsApp({
        phone: senderId,
        fullName: message.customerProfile?.name,
        source: 'WhatsApp Directo'
      });

      if (isNew && isFreshMessage && this.botService && message.type === 'text' && message.text?.body) {
        // Se pasa el "id" interno de YCloud (no el "wamid") porque el
        // indicador de leído/escribiendo lo referencia así:
        // POST /whatsapp/inboundMessages/{id}/markAsRead — ver
        // whatsappMessageService.sendTypingIndicatorViaYCloud.
        await this.botService.handleIncomingMessage(senderId, message.text.body, message.id);
      }
    } catch (error) {
      console.error(`❌ [YCloud Webhook] Error al guardar el mensaje ${message.id}:`, error);
    }
  }

  async handleStatusUpdate(message) {
    if (!message.wamid) return;
    const statusError = message.error
      ? `${message.error.code ? `[${message.error.code}] ` : ''}${message.error.message || ''}`.trim() || null
      : null;

    console.log(`📶 [YCloud Webhook] Actualización de estado: mensaje ${message.wamid} → ${message.status}${statusError ? ` (${statusError})` : ''}`);
    try {
      await this.messageService.updateStatus(message.wamid, message.status, statusError, message.id);
    } catch (error) {
      console.error(`❌ [YCloud Webhook] Error al actualizar el estado del mensaje ${message.wamid}:`, error);
    }
  }
}
