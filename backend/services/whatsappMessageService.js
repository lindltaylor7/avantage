import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function extractBody(message) {
  switch (message.type) {
    case 'text': return message.text?.body || '';
    case 'button': return message.button?.text || '';
    case 'interactive':
      return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
    case 'image': return message.image?.caption || '[Imagen]';
    case 'video': return message.video?.caption || '[Video]';
    case 'audio': return '[Audio]';
    case 'document': return message.document?.caption || message.document?.filename || '[Documento]';
    case 'location': return `[Ubicación] ${message.location?.name || ''}`.trim();
    case 'sticker': return '[Sticker]';
    default: return '';
  }
}

/**
 * Persistencia y envío de mensajes de WhatsApp Business Platform: guarda los
 * mensajes entrantes recibidos vía webhook y permite responder vía la Graph API.
 */
export class WhatsappMessageService {
  async createFromMessage(value, message) {
    const contact = (value.contacts || []).find((c) => c.wa_id === message.from);

    const [id] = await db('whatsapp_messages')
      .insert({
        wa_id: message.from,
        contact_name: contact?.profile?.name || null,
        message_id: message.id,
        message_type: message.type,
        body: extractBody(message),
        direction: 'inbound',
        raw_payload: JSON.stringify(message),
        received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date()
      })
      .onConflict('message_id')
      .ignore();

    if (!id) return this.getByMessageId(message.id);
    return this.getById(id);
  }

  /**
   * Envía un mensaje de texto libre a un contacto vía la Graph API. Solo
   * funciona dentro de la ventana de 24h desde el último mensaje del cliente;
   * fuera de ella, WhatsApp exige usar una plantilla aprobada.
   */
  async sendTextMessage(waId, body) {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
    if (!phoneNumberId) {
      throw new Error('META_WHATSAPP_PHONE_NUMBER_ID no está configurado en el servidor.');
    }
    if (!accessToken) {
      throw new Error('META_WHATSAPP_ACCESS_TOKEN (o META_PAGE_ACCESS_TOKEN) no está configurado en el servidor.');
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waId,
        type: 'text',
        text: { body }
      })
    });
    const data = await response.json();

    if (!response.ok) {
      const reason = data?.error?.message || JSON.stringify(data);
      throw new Error(`WhatsApp rechazó el envío: ${reason}`);
    }

    const messageId = data.messages?.[0]?.id;
    const [id] = await db('whatsapp_messages').insert({
      wa_id: waId,
      contact_name: null,
      message_id: messageId,
      message_type: 'text',
      body,
      direction: 'outbound',
      status: 'sent',
      raw_payload: JSON.stringify(data)
    });

    return this.getById(id);
  }

  /**
   * Actualiza el estado (sent/delivered/read/failed) de un mensaje saliente a
   * partir de las actualizaciones de estado recibidas por webhook.
   */
  async updateStatus(messageId, status) {
    await db('whatsapp_messages').where({ message_id: messageId }).update({ status });
  }

  async getById(id) {
    return db('whatsapp_messages').where({ id }).first();
  }

  async getByMessageId(messageId) {
    return db('whatsapp_messages').where({ message_id: messageId }).first();
  }

  async getRecent({ limit = 50 } = {}) {
    return db('whatsapp_messages').orderBy('received_at', 'desc').limit(limit);
  }

  /**
   * Lista de conversaciones (un registro por contacto, con su último mensaje),
   * para mostrar una bandeja de entrada tipo chat.
   */
  async getConversations({ limit = 100 } = {}) {
    const rows = await db('whatsapp_messages').orderBy('received_at', 'desc');
    const seen = new Map();
    for (const row of rows) {
      if (!seen.has(row.wa_id)) seen.set(row.wa_id, row);
    }
    return [...seen.values()].slice(0, limit);
  }

  /**
   * Hilo completo (entrantes + salientes) de un contacto, en orden cronológico.
   */
  async getThread(waId, { limit = 200 } = {}) {
    return db('whatsapp_messages').where({ wa_id: waId }).orderBy('received_at', 'asc').limit(limit);
  }

  async getStats() {
    const [{ total }] = await db('whatsapp_messages').count('* as total');
    const [{ contacts }] = await db('whatsapp_messages').countDistinct('wa_id as contacts');
    return { total: Number(total), contacts: Number(contacts) };
  }
}
