import { db } from '../db/connection.js';

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
 * Persistencia de los mensajes entrantes de WhatsApp Business Platform
 * recibidos vía webhook (campo "messages").
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
        raw_payload: JSON.stringify(message),
        received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date()
      })
      .onConflict('message_id')
      .ignore();

    if (!id) return this.getByMessageId(message.id);
    return this.getById(id);
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

  async getStats() {
    const [{ total }] = await db('whatsapp_messages').count('* as total');
    const [{ contacts }] = await db('whatsapp_messages').countDistinct('wa_id as contacts');
    return { total: Number(total), contacts: Number(contacts) };
  }
}
