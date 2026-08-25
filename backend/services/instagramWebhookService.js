import crypto from 'crypto';
import { LeadService } from './leadService.js';
import { PageInteractionService } from './pageInteractionService.js';
import { PageMessageService } from './pageMessageService.js';

const MAX_RECENT_EVENTS = 50;

/**
 * Servicio para recepción, verificación y almacenamiento de eventos
 * del webhook de Instagram Graph API / Instagram Messaging / Instagram Comments.
 */
export class InstagramWebhookService {
  constructor() {
    this.leadService = new LeadService();
    this.pageInteractionService = new PageInteractionService();
    this.pageMessageService = new PageMessageService();
    this.recentEvents = [];
  }

  /**
   * Guarda en memoria los últimos webhooks de Instagram recibidos
   * para visualizarlos en vivo en la interfaz de usuario.
   */
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
   * Valida el reto de verificación (GET) que envía Meta al configurar el webhook de Instagram.
   */
  verifyChallenge(mode, token) {
    const expectedToken = process.env.META_INSTAGRAM_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
    return mode === 'subscribe' && !!expectedToken && token === expectedToken;
  }

  /**
   * App Secret usado para validar la firma de este webhook. Si la
   * suscripción de Instagram vive en una app de Meta distinta a la del resto
   * (Página/WhatsApp), META_INSTAGRAM_APP_SECRET permite usar un secreto
   * propio; si no está definido, se usa el general META_APP_SECRET.
   */
  hasAppSecret() {
    return !!(process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET);
  }

  /**
   * Valida la firma X-Hub-Signature-256 del payload (POST) usando el App Secret de Meta.
   */
  verifySignature(rawBody, signatureHeader) {
    const appSecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
    if (!appSecret || !rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = signatureHeader.slice('sha256='.length);

  console.log('esperado:', expected);
  console.log('recibido:', provided);
  console.log('rawBody length:', rawBody.length);

  console.log('appSecret entre corchetes: [' + appSecret + ']');
console.log('appSecret length:', appSecret.length);

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Procesa una entrada ("entry") del payload de Instagram (comments, mentions, messages, story_insights, etc.)
   */
  async handleEntry(entry) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      try {
        console.log(`📸 [Instagram Webhook] Evento de cambio procesado: campo="${change.field}"`);
        if (change.field === 'comments') {
          await this.pageInteractionService.createFromInstagramCommentChange(entry?.id, change.value || {}, entry?.time);
        } else if (change.field === 'feed') {
          await this.pageInteractionService.createFromFeedChange(entry?.id, change.value || {});
        }
      } catch (error) {
        console.error(`❌ [Instagram Webhook] Error al procesar cambio de campo "${change.field}":`, error);
      }
    }

    const messagingEvents = entry?.messaging || [];
    for (const event of messagingEvents) {
      try {
        console.log(`📸 [Instagram Webhook] Evento de mensaje recibido de ${event.sender?.id}`);
        await this.pageMessageService.createFromMessagingEvent(entry?.id, event);
      } catch (error) {
        console.error('❌ [Instagram Webhook] Error al procesar evento de mensajería:', error);
      }
    }
  }
}
