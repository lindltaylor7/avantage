import { db } from '../db/connection.js';
import { CONTRACT_TEMPLATES } from './contractTemplates.js';

export const CONTRACT_STATUSES = ['borrador', 'firmado', 'anulado'];

const SETTER_ONLY_STATUSES = ['conversacion_abierta', 'calificando', 'congelado', 'transferido_closer', 'descartado'];

const EDITABLE_FIELDS = {
  title: 'title',
  status: 'status',
  clientName: 'client_name',
  clientDni: 'client_dni',
  clientAddress: 'client_address',
  clientEmail: 'client_email',
  clientPhone: 'client_phone',
  serviceDescription: 'service_description',
  totalAmount: 'total_amount',
  currency: 'currency',
  city: 'city',
  contractDate: 'contract_date',
  representativeName: 'representative_name'
};

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

// mysql2 entrega DATE como un Date a medianoche LOCAL; serializado a JSON
// (UTC) podía correrse un día. Se devuelve siempre como "YYYY-MM-DD".
function withIsoDate(contract) {
  const d = contract.contract_date;
  if (d instanceof Date) {
    contract.contract_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return contract;
}

function cleanClauses(clauses) {
  return (clauses || [])
    .map((c) => ({ title: String(c.title || '').trim(), body: String(c.body || '').trim() }))
    .filter((c) => c.title || c.body)
    .map((c, index) => ({ position: index + 1, title: c.title || 'CLÁUSULA', body: c.body }));
}

export class ContractService {
  async list({ leadId } = {}) {
    const query = db('contracts')
      .leftJoin('leads', 'contracts.lead_id', 'leads.id')
      .select('contracts.*', 'leads.full_name as lead_name')
      .orderBy('contracts.created_at', 'desc');
    if (leadId) query.where('contracts.lead_id', leadId);
    return (await query).map(withIsoDate);
  }

  /**
   * Clientes del Funnel de Ventas para asociar un contrato: se excluyen las
   * etapas que solo existen en el Setter Funnel (el bot aún los califica) y
   * los descartados.
   */
  async listClientLeads() {
    return db('leads')
      .whereNotIn('status', SETTER_ONLY_STATUSES)
      .select('id', 'full_name', 'phone', 'dni', 'status')
      .orderBy('created_at', 'desc');
  }

  async getById(id) {
    const contract = await db('contracts').where({ id }).first();
    if (!contract) return null;
    contract.clauses = await db('contract_clauses').where({ contract_id: id }).orderBy('position');
    return withIsoDate(contract);
  }

  /**
   * Crea un contrato desde una plantilla. Los datos de la parte cliente se
   * copian del lead (si se indica) y quedan editables en el contrato.
   */
  async create({ templateKey = 'cliente', leadId = null, createdBy = null }) {
    const template = CONTRACT_TEMPLATES[templateKey];
    if (!template) throw Object.assign(new Error('Plantilla de contrato no encontrada.'), { status: 400 });

    const lead = leadId ? await db('leads').where({ id: leadId }).first() : null;
    if (leadId && !lead) throw Object.assign(new Error('Lead no encontrado.'), { status: 404 });

    const location = [lead?.address, lead?.province, lead?.department].filter(Boolean).join(', ');

    return db.transaction(async (trx) => {
      const [id] = await trx('contracts').insert({
        lead_id: lead?.id || null,
        template_key: templateKey,
        title: template.title,
        client_name: lead?.full_name || null,
        client_dni: lead?.dni || null,
        client_address: location || null,
        client_email: lead?.email || null,
        client_phone: lead?.phone || null,
        service_description: lead?.topic || null,
        total_amount: lead?.total_amount ?? null,
        city: lead?.province || lead?.department || null,
        contract_date: todayIso(),
        created_by: createdBy
      });
      const clauses = cleanClauses(template.clauses).map((c) => ({ ...c, contract_id: id }));
      if (clauses.length) await trx('contract_clauses').insert(clauses);
      return id;
    }).then((id) => this.getById(id));
  }

  /**
   * Actualiza los datos del contrato y, si vienen, REEMPLAZA sus cláusulas
   * por la lista recibida (en ese orden): así agregar, quitar y reordenar es
   * una sola operación atómica.
   */
  async update(id, data) {
    const payload = {};
    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
      if (data[key] !== undefined) payload[column] = data[key] === '' ? null : data[key];
    }
    if (payload.status && !CONTRACT_STATUSES.includes(payload.status)) {
      throw Object.assign(new Error('Estado de contrato no válido.'), { status: 400 });
    }
    if (payload.title === null) delete payload.title;

    const updated = await db.transaction(async (trx) => {
      const count = await trx('contracts').where({ id }).update({ ...payload, updated_at: trx.fn.now() });
      if (!count) return false;
      if (Array.isArray(data.clauses)) {
        await trx('contract_clauses').where({ contract_id: id }).del();
        const clauses = cleanClauses(data.clauses).map((c) => ({ ...c, contract_id: id }));
        if (clauses.length) await trx('contract_clauses').insert(clauses);
      }
      return true;
    });
    return updated ? this.getById(id) : null;
  }

  async remove(id) {
    return db('contracts').where({ id }).del();
  }
}
