import crypto from 'crypto';
import { LeadService } from './leadService.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/**
 * Recepción e importación de leads generados por Meta Lead Ads (Facebook/Instagram)
 * vía el webhook de la app de Meta (campo "leadgen").
 */
export class MetaWebhookService {
  constructor() {
    this.leadService = new LeadService();
  }

  /**
   * Valida el reto de verificación (GET) que envía Meta al configurar el webhook.
   */
  verifyChallenge(mode, token) {
    return mode === 'subscribe' && !!process.env.META_VERIFY_TOKEN && token === process.env.META_VERIFY_TOKEN;
  }

  /**
   * Valida la firma X-Hub-Signature-256 del payload (POST) usando el App Secret.
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
   * Procesa una entrada ("entry") del payload del webhook, importando cada
   * evento de generación de lead ("leadgen") que contenga.
   */
  async handleEntry(entry) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      try {
        await this.importLead(leadgenId);
      } catch (error) {
        console.error(`❌ [Meta Webhook] Error al importar el lead ${leadgenId}:`, error);
      }
    }
  }

  /**
   * Recupera los datos de un lead desde la Graph API y lo registra como
   * prospecto, evitando duplicados si el evento se reenvía.
   */
  async importLead(leadgenId) {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) {
      console.error('❌ [Meta Webhook] Falta META_PAGE_ACCESS_TOKEN en el entorno, no se puede recuperar el lead.');
      return null;
    }

    const marker = `[Meta leadgen_id=${leadgenId}]`;
    const existing = await this.leadService.findByAdditionalNotesContaining(marker);
    if (existing) {
      console.log(`↩️ [Meta Webhook] Lead ${leadgenId} ya importado como prospecto #${existing.id}, se omite.`);
      return existing;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}?access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Meta Webhook] Error al recuperar el lead desde la Graph API:', data);
      return null;
    }

    const fields = {};
    for (const item of data.field_data || []) {
      fields[item.name] = item.values?.[0] || '';
    }

    const prospect = await this.leadService.createProspect({
      fullName: fields.full_name || fields.nombre_completo || 'Prospecto de Facebook',
      email: fields.email || fields.correo_electronico || '',
      phone: fields.phone_number || fields.phone || '',
      source: 'Facebook Ads',
      additionalNotes: `${marker} form_id=${data.form_id || 'desconocido'}`
    });

    console.log(`📥 [Meta Webhook] Lead importado como prospecto #${prospect.id} (leadgen_id=${leadgenId})`);
    return prospect;
  }
}
