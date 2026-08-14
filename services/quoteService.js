import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para las cotizaciones generadas a leads en
 * las etapas "contactado" o "en_negociacion" del funnel de ventas.
 */
export class QuoteService {
  async createQuote({ leadId, amount, currency = 'PEN', notes }) {
    const [id] = await db('quotes').insert({
      lead_id: leadId,
      amount,
      currency,
      notes: notes || null
    });
    return this.getQuoteById(id);
  }

  async getQuoteById(id) {
    return db('quotes').where({ id }).first();
  }

  async getQuotesByLead(leadId) {
    return db('quotes').where({ lead_id: leadId }).orderBy('created_at', 'desc');
  }
}
