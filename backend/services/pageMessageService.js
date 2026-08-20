import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/**
 * Persistencia de los mensajes directos (Messenger) recibidos en la bandeja
 * de entrada de la Página, vía el campo "messaging" del webhook de Meta.
 */
export class PageMessageService {
  async createFromMessagingEvent(pageId, event) {
    const message = event.message;
    // Se ignoran los "echoes" (copia de los mensajes que la propia página
    // envió) y otros eventos de messaging sin contenido de mensaje (recibos
    // de lectura, postbacks, etc. no se persisten por ahora).
    if (!message || message.is_echo) return null;

    const senderId = event.sender?.id;
    if (!senderId) return null;

    const senderName = await this.resolveSenderName(senderId);

    const [id] = await db('page_messages')
      .insert({
        page_id: pageId,
        sender_id: senderId,
        sender_name: senderName,
        message_id: message.mid,
        text: message.text || (message.attachments ? '[Adjunto]' : null),
        raw_payload: JSON.stringify(event),
        received_at: event.timestamp ? new Date(Number(event.timestamp)) : new Date()
      })
      .onConflict('message_id')
      .ignore();

    if (!id) return this.getByMessageId(message.mid);
    return this.getById(id);
  }

  async resolveSenderName(senderId) {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) return null;

    try {
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${senderId}?fields=name&access_token=${encodeURIComponent(pageAccessToken)}`;
      const response = await fetch(url);
      const data = await response.json();
      return response.ok ? (data.name || null) : null;
    } catch (error) {
      console.error(`❌ [Meta Webhook] Error al resolver el nombre del remitente ${senderId}:`, error);
      return null;
    }
  }

  async getById(id) {
    return db('page_messages').where({ id }).first();
  }

  async getByMessageId(messageId) {
    return db('page_messages').where({ message_id: messageId }).first();
  }

  async getRecent({ limit = 50 } = {}) {
    return db('page_messages').orderBy('received_at', 'desc').limit(limit);
  }

  async getStats() {
    const [{ total }] = await db('page_messages').count('* as total');
    const [{ contacts }] = await db('page_messages').countDistinct('sender_id as contacts');
    return { total: Number(total), contacts: Number(contacts) };
  }
}
