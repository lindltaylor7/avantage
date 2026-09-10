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
    validUntil
  }) {
    const [id] = await db('quotes').insert({
      lead_id: leadId,
      amount,
      currency,
      notes: notes || null,
      concept_title: conceptTitle || 'TESIS COMPLETA',
      quantity: Number(quantity) > 0 ? Number(quantity) : 1,
      scope_items: scopeItems || null,
      valid_until: validUntil || null
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
