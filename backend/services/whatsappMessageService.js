import fs from 'fs';
import path from 'path';
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
 * Detecta el canal de origen de una conversación a partir del objeto
 * "referral" que WhatsApp incluye en el primer mensaje cuando el cliente
 * escribió después de tocar un anuncio o publicación de "Enviar mensaje" en
 * Facebook o Instagram. Sin ese objeto, es un contacto directo/orgánico.
 * Nota: Meta no manda un campo explícito "fb"/"ig" en el referral, así que
 * la distinción Facebook/Instagram se infiere del dominio de "source_url".
 */
export function detectWhatsappChannel(referral) {
  if (!referral) return 'WhatsApp Directo';

  const url = (referral.source_url || '').toLowerCase();
  if (url.includes('instagram.com')) return 'Instagram Ads';
  if (url.includes('facebook.com') || url.includes('fb.me') || url.includes('l.facebook.com')) return 'Facebook Ads';
  if (referral.source_type === 'ad') return 'Anuncio de Meta';
  if (referral.source_type === 'post') return 'Publicación de Meta';
  return 'Anuncio de Meta';
}

/**
 * Persistencia y envío de mensajes de WhatsApp Business Platform: guarda los
 * mensajes entrantes recibidos vía webhook y permite responder vía la Graph API.
 */
export class WhatsappMessageService {
  async createFromMessage(value, message) {
    // Normalmente el remitente viene en "from" (teléfono). Algunos mensajes
    // (p. ej. contactos vinculados por Instagram que no comparten su número)
    // en cambio traen "from_user_id" con un identificador tipo "PE.xxxxx".
    const senderId = message.from || message.from_user_id;
    if (!senderId) {
      console.error('❌ [WhatsApp] Mensaje sin remitente identificable, se descarta:', JSON.stringify(message));
      return null;
    }

    const contact = (value.contacts || []).find((c) => (c.wa_id || c.user_id) === senderId);

    const [id] = await db('whatsapp_messages')
      .insert({
        wa_id: senderId,
        contact_name: contact?.profile?.name || null,
        message_id: message.id,
        message_type: message.type,
        body: extractBody(message),
        direction: 'inbound',
        channel: detectWhatsappChannel(message.referral),
        referral: message.referral ? JSON.stringify(message.referral) : null,
        raw_payload: JSON.stringify(message),
        received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date()
      })
      .onConflict('message_id')
      .ignore();

    // "isNew" indica si esta llamada realmente insertó el mensaje o si ya
    // existía (Meta reenvía el mismo evento de webhook por reintentos) — el
    // llamador lo usa para no procesar dos veces el mismo mensaje en el bot.
    if (!id) return { record: await this.getByMessageId(message.id), isNew: false };
    return { record: await this.getById(id), isNew: true };
  }

  /**
   * Inserta un mensaje entrante simulado (usado por el simulador de pruebas
   * del panel admin, que no pasa por el webhook real de Meta) para que el
   * motor conversacional del bot pueda reconstruir el hilo con el historial
   * completo, igual que con mensajes reales.
   */
  async createSimulatedInbound(waId, body) {
    const [id] = await db('whatsapp_messages').insert({
      wa_id: waId,
      contact_name: null,
      message_id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message_type: 'text',
      body,
      direction: 'inbound',
      channel: 'Simulado (Panel Admin)',
      received_at: new Date()
    });
    return this.getById(id);
  }

  /**
   * Envía un mensaje de texto libre a un contacto vía la Graph API. Solo
   * funciona dentro de la ventana de 24h desde el último mensaje del cliente;
   * fuera de ella, WhatsApp exige usar una plantilla aprobada.
   *
   * Para contactos identificados solo por BSUID (p. ej. "PE.1551888569771124",
   * cuando no compartieron su número) NO se usa el campo "to": la Graph API
   * exige el campo "recipient" en su lugar, con el BSUID completo.
   * https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
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

    const isBsuid = /^[A-Za-z]{2}\.[A-Za-z0-9]+$/.test(waId);

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...(isBsuid ? { recipient: waId } : { to: waId }),
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
   * Envía un archivo (imagen o documento) a un contacto vía la Graph API:
   * primero sube el fichero al endpoint /media para obtener un media id y
   * luego manda el mensaje referenciándolo. Igual que el texto libre, solo
   * funciona dentro de la ventana de 24h desde el último mensaje del cliente.
   */
  async sendMediaMessage(waId, { filePath, filename, mimeType, caption }) {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
    if (!phoneNumberId) {
      throw new Error('META_WHATSAPP_PHONE_NUMBER_ID no está configurado en el servidor.');
    }
    if (!accessToken) {
      throw new Error('META_WHATSAPP_ACCESS_TOKEN (o META_PAGE_ACCESS_TOKEN) no está configurado en el servidor.');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error('El archivo a enviar no existe en el servidor.');
    }

    const resolvedMime = mimeType || 'application/octet-stream';
    const isImage = resolvedMime.startsWith('image/');
    const isBsuid = /^[A-Za-z]{2}\.[A-Za-z0-9]+$/.test(waId);
    const baseUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}`;

    // 1. Subir el archivo y obtener el media id.
    const fileBuffer = await fs.promises.readFile(filePath);
    const uploadForm = new FormData();
    uploadForm.append('messaging_product', 'whatsapp');
    uploadForm.append('type', resolvedMime);
    uploadForm.append('file', new Blob([fileBuffer], { type: resolvedMime }), filename || path.basename(filePath));

    const uploadResponse = await fetch(`${baseUrl}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: uploadForm
    });
    const uploadData = await uploadResponse.json();
    if (!uploadResponse.ok || !uploadData.id) {
      const reason = uploadData?.error?.message || JSON.stringify(uploadData);
      throw new Error(`WhatsApp rechazó la subida del archivo: ${reason}`);
    }

    // 2. Enviar el mensaje con el media id.
    const mediaObject = isImage
      ? { id: uploadData.id, caption: caption || undefined }
      : { id: uploadData.id, filename: filename || 'documento', caption: caption || undefined };

    const sendResponse = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...(isBsuid ? { recipient: waId } : { to: waId }),
        type: isImage ? 'image' : 'document',
        [isImage ? 'image' : 'document']: mediaObject
      })
    });
    const sendData = await sendResponse.json();
    if (!sendResponse.ok) {
      const reason = sendData?.error?.message || JSON.stringify(sendData);
      throw new Error(`WhatsApp rechazó el envío: ${reason}`);
    }

    const messageId = sendData.messages?.[0]?.id;
    const [id] = await db('whatsapp_messages').insert({
      wa_id: waId,
      contact_name: null,
      message_id: messageId,
      message_type: isImage ? 'image' : 'document',
      body: caption || `[${isImage ? 'Imagen' : 'Documento'}] ${filename || ''}`.trim(),
      direction: 'outbound',
      status: 'sent',
      raw_payload: JSON.stringify(sendData)
    });

    return this.getById(id);
  }

  /**
   * Marca el último mensaje del contacto como leído y muestra el indicador de
   * "escribiendo..." de WhatsApp (dura hasta 25s o hasta que el bot envía su
   * respuesta). Requiere el `message_id` del mensaje entrante. Silencioso si
   * WhatsApp no está configurado o no hay un id.
   */
  async sendTypingIndicator(messageId) {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken || !messageId) return;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' }
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error?.message || `WhatsApp rechazó el indicador de escritura (HTTP ${response.status}).`);
    }
  }

  /**
   * Actualiza el estado (sent/delivered/read/failed) de un mensaje saliente a
   * partir de las actualizaciones de estado recibidas por webhook, guardando
   * el motivo del fallo si WhatsApp lo reporta.
   */
  async updateStatus(messageId, status, statusError = null) {
    await db('whatsapp_messages').where({ message_id: messageId }).update({ status, status_error: statusError });
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
   * Lista de conversaciones (un registro por contacto con su último mensaje),
   * conservando el canal de origen detectado en el PRIMER mensaje del
   * contacto (el "referral" solo llega en el mensaje que inició la
   * conversación, no en los siguientes).
   */
  async getConversations({ limit = 100 } = {}) {
    const rows = await db('whatsapp_messages').whereNotNull('wa_id').where('wa_id', '!=', '').orderBy('received_at', 'asc');
    const map = new Map();
    for (const row of rows) {
      const originChannel = map.get(row.wa_id)?.origin_channel ?? row.channel;
      map.set(row.wa_id, { ...row, origin_channel: originChannel });
    }
    return [...map.values()]
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
      .slice(0, limit);
  }

  /**
   * Hilo completo (entrantes + salientes) de un contacto, en orden cronológico.
   * `since` acota a mensajes desde esa fecha en adelante (p. ej. desde que
   * arrancó la sesión actual del bot), sin borrar ni tocar el historial real
   * — solo para no arrastrarle al LLM el contexto de una conversación previa
   * ya reiniciada desde el panel.
   */
  async getThread(waId, { limit = 200, since = null } = {}) {
    let query = db('whatsapp_messages').where({ wa_id: waId });
    if (since) query = query.where('received_at', '>=', since);
    return query.orderBy('received_at', 'asc').limit(limit);
  }

  async getStats() {
    const [{ total }] = await db('whatsapp_messages').count('* as total');
    const [{ contacts }] = await db('whatsapp_messages').countDistinct('wa_id as contacts');
    return { total: Number(total), contacts: Number(contacts) };
  }
}
