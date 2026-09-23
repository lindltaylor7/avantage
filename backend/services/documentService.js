/**
 * Módulo de Documentos: la lista única de todo lo que el equipo emite a un
 * cliente — cotizaciones y contratos — ordenada de lo más reciente a lo más
 * antiguo y buscable por el nombre del lead.
 *
 * Existe porque las cotizaciones vivían solo dentro de la ficha de su lead (no
 * había forma de verlas todas juntas) y los contratos en su propia pantalla:
 * para responder "¿qué le mandamos a este cliente y cuándo?" había que abrir
 * dos sitios distintos y saber de antemano a qué lead pertenecía.
 *
 * Los dos tipos se normalizan a la MISMA forma para poder mezclarlos en una
 * sola tabla ordenada por fecha. Lo que no se comparte (el código de la
 * cotización, el DNI del contrato) viaja en `extra`, que la vista muestra solo
 * si viene.
 */

/** Los dos tipos de documento que lista el módulo. */
export const DOCUMENT_KINDS = { QUOTE: 'cotizacion', CONTRACT: 'contrato' };

/** Fecha comparable de un documento; los que no la tengan van al final. */
function timeOf(doc) {
  const t = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function normalizeQuote(quote) {
  return {
    kind: DOCUMENT_KINDS.QUOTE,
    id: quote.id,
    leadId: quote.lead_id,
    leadName: quote.lead_name || null,
    title: quote.concept_title || 'Cotización',
    amount: quote.amount != null ? Number(quote.amount) : null,
    currency: quote.currency || 'PEN',
    status: quote.status || null,
    statusLabel: quote.status_label || null,
    createdAt: quote.created_at || null,
    // El documento imprimible de cada tipo vive en su propia ruta; la vista
    // solo necesita saber cuál pedir.
    documentUrl: `/api/quotes/${quote.id}/document`,
    extra: {
      code: quote.code || null,
      validUntil: quote.valid_until || null
    }
  };
}

function normalizeContract(contract) {
  return {
    kind: DOCUMENT_KINDS.CONTRACT,
    id: contract.id,
    leadId: contract.lead_id,
    // Un contrato puede no estar atado a un lead (se emite a mano): ahí manda
    // el nombre del cliente que se escribió en el propio contrato.
    leadName: contract.lead_name || contract.client_name || null,
    title: contract.title || 'Contrato',
    amount: contract.total_amount != null ? Number(contract.total_amount) : null,
    currency: contract.currency || 'PEN',
    status: contract.status || null,
    statusLabel: null,
    createdAt: contract.created_at || null,
    documentUrl: `/api/contracts/${contract.id}/document`,
    extra: {
      clientDni: contract.client_dni || null,
      contractDate: contract.contract_date || null
    }
  };
}

/** Normaliza el texto para buscar sin depender de tildes ni mayúsculas. */
function searchable(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export class DocumentService {
  constructor({ quoteService, contractService } = {}) {
    this.quoteService = quoteService;
    this.contractService = contractService;
  }

  /**
   * Lista unificada de documentos.
   *
   * `includeContracts` viene de los permisos de quien pregunta: los contratos
   * tienen su propio permiso (`contracts.manage`), y este módulo no puede ser
   * la puerta de atrás que se lo salte. Quien no lo tenga ve solo las
   * cotizaciones, y la respuesta lo dice en `kinds` para que la pantalla pueda
   * explicarlo en vez de mostrar una lista incompleta sin avisar.
   */
  async list({ search = null, includeContracts = true } = {}) {
    const [quotes, contracts] = await Promise.all([
      this.quoteService.listAll(),
      includeContracts ? this.contractService.list() : Promise.resolve([])
    ]);

    let documents = [
      ...quotes.map(normalizeQuote),
      ...contracts.map(normalizeContract)
    ].sort((a, b) => timeOf(b) - timeOf(a));

    const term = searchable(search).trim();
    if (term) {
      // Se busca por el nombre del lead, que es como se pregunta por un
      // documento ("el contrato de Julinho"). El número de documento también
      // vale: es lo que se tiene a mano cuando el nombre no se recuerda.
      documents = documents.filter((doc) => (
        searchable(doc.leadName).includes(term)
        || searchable(doc.extra?.code).includes(term)
        || String(doc.id) === term
      ));
    }

    return {
      documents,
      total: documents.length,
      kinds: includeContracts
        ? [DOCUMENT_KINDS.QUOTE, DOCUMENT_KINDS.CONTRACT]
        : [DOCUMENT_KINDS.QUOTE]
    };
  }
}
