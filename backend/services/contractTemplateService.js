import { db } from '../db/connection.js';
import { cleanClauses } from './contractService.js';

/**
 * Tipos de contrato (plantillas): título, apertura, cierre y cláusulas base
 * con las que arranca cada contrato nuevo. Editarlos o borrarlos no toca los
 * contratos ya creados, que guardan su propia copia.
 */
export class ContractTemplateService {
  async list() {
    const [templates, clauses] = await Promise.all([
      db('contract_templates').orderBy('label'),
      db('contract_template_clauses').orderBy(['template_id', 'position'])
    ]);
    return templates.map((t) => ({ ...t, clauses: clauses.filter((c) => c.template_id === t.id) }));
  }

  async getById(id) {
    const template = await db('contract_templates').where({ id }).first();
    if (!template) return null;
    template.clauses = await db('contract_template_clauses').where({ template_id: id }).orderBy('position');
    return template;
  }

  async create(data) {
    const id = await db.transaction(async (trx) => {
      const [templateId] = await trx('contract_templates').insert(this._fields(data));
      await this._replaceClauses(trx, templateId, data.clauses);
      return templateId;
    });
    return this.getById(id);
  }

  async update(id, data) {
    const found = await db.transaction(async (trx) => {
      const count = await trx('contract_templates').where({ id }).update({ ...this._fields(data), updated_at: trx.fn.now() });
      if (!count) return false;
      await this._replaceClauses(trx, id, data.clauses);
      return true;
    });
    return found ? this.getById(id) : null;
  }

  async remove(id) {
    return db('contract_templates').where({ id }).del();
  }

  _fields({ label, title, intro, closing }) {
    const cleanLabel = String(label || '').trim();
    const cleanTitle = String(title || '').trim();
    if (!cleanLabel || !cleanTitle) {
      throw Object.assign(new Error('El tipo de contrato necesita un nombre y un título.'), { status: 400 });
    }
    return { label: cleanLabel, title: cleanTitle, intro: String(intro || '').trim() || null, closing: String(closing || '').trim() || null };
  }

  async _replaceClauses(trx, templateId, clauses) {
    await trx('contract_template_clauses').where({ template_id: templateId }).del();
    const rows = cleanClauses(clauses).map((c) => ({ ...c, template_id: templateId }));
    if (rows.length) await trx('contract_template_clauses').insert(rows);
  }
}
