import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para las cotizaciones generadas a los leads
 * del funnel de ventas.
 */
export class QuoteService {
  async createQuote({
    leadId,
    amount,
    currency = 'PEN',
    notes,
    conceptTitle = 'TESIS COMPLETA',
    quantity = 1,
    scopeItems,
    validUntil,
    code,
    estimatedTime,
    statusLabel,
    regularAmount,
    discount,
    serviceSubtitle,
    warrantyText,
    commercialTerms
  }) {
    const optionalAmount = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    };
    const optionalText = (value, max) => {
      const text = String(value ?? '').trim();
      return text ? text.slice(0, max) : null;
    };

    const [id] = await db('quotes').insert({
      lead_id: leadId,
      amount,
      currency,
      notes: notes || null,
      concept_title: conceptTitle || 'TESIS COMPLETA',
      quantity: Number(quantity) > 0 ? Number(quantity) : 1,
      scope_items: scopeItems || null,
      valid_until: validUntil || null,
      code: optionalText(code, 40),
      estimated_time: optionalText(estimatedTime, 60),
      status_label: optionalText(statusLabel, 60),
      // El precio regular solo se guarda si de verdad es mayor al acordado:
      // si no, el bloque de descuento del documento mostraría un "ahorro"
      // negativo o de cero.
      regular_amount: optionalAmount(regularAmount) > Number(amount) ? optionalAmount(regularAmount) : null,
      discount: optionalAmount(discount),
      service_subtitle: optionalText(serviceSubtitle, 250),
      warranty_text: optionalText(warrantyText, 2000),
      commercial_terms: optionalText(commercialTerms, 2000)
    });
    return this.getQuoteById(id);
  }

  async getQuoteById(id) {
    return db('quotes').where({ id }).first();
  }

  /**
   * Devuelve la cotización junto con los datos del lead necesarios para
   * emitir el documento con la marca de Avantage Group.
   */
  async getQuoteWithLead(id) {
    const quote = await db('quotes').where({ id }).first();
    if (!quote) return null;
    const lead = await db('leads').where({ id: quote.lead_id }).first();
    return { quote, lead };
  }

  async getQuotesByLead(leadId) {
    return db('quotes').where({ lead_id: leadId }).orderBy('created_at', 'desc');
  }
}
