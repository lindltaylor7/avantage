import { db } from '../db/connection.js';

/**
 * Catálogo de carreras: las áreas (`career_groups`) y las carreras que cuelgan
 * de cada una (`careers`). Es lo que alimenta todos los desplegables de
 * "Carrera" del panel y del evaluador público — ver la nota de la migración
 * `20261020000000_create_careers_catalog`.
 *
 * Dos reglas que conviene tener presentes al leer este archivo:
 *
 * 1. El lead, el proyecto y el contrato guardan la carrera como **texto**, no
 *    como `career_id`. Borrar una carrera del catálogo no borra ese dato ni
 *    rompe una ficha existente: solo deja de ofrecerse en la lista.
 * 2. Por eso mismo, renombrar una carrera puede propagarse a los leads y
 *    proyectos que la usan (`propagate`), pero nunca a cotizaciones, contratos
 *    ni comprobantes: esos son documentos ya emitidos y deben seguir diciendo
 *    lo que decían cuando el cliente los firmó.
 */

/** Tablas donde la carrera es un dato vivo y editable (no un documento emitido). */
const CAREER_USAGE_TABLES = [
  { table: 'leads', column: 'field_of_study' },
  { table: 'projects', column: 'field_of_study' }
];

function cleanName(value, max = 150) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export class CareerCatalogService {
  /**
   * Catálogo completo, agrupado y en orden.
   *
   * @param {{ includeInactive?: boolean, withUsage?: boolean }} options
   *   `includeInactive` trae también las carreras apagadas (la pantalla de
   *   administración las necesita; los desplegables, no). `withUsage` agrega a
   *   cada carrera cuántos leads y proyectos la usan, para que quien
   *   administra sepa qué está a punto de tocar.
   */
  async listCatalog({ includeInactive = false, withUsage = false } = {}) {
    const groups = await db('career_groups').orderBy('position', 'asc').orderBy('id', 'asc');

    const query = db('careers').orderBy('position', 'asc').orderBy('id', 'asc');
    if (!includeInactive) query.where('is_active', true);
    const careers = await query;

    const usage = withUsage ? await this.countUsage() : null;

    const byGroup = new Map(groups.map((group) => [group.id, []]));
    for (const career of careers) {
      const bucket = byGroup.get(career.group_id);
      if (!bucket) continue;
      bucket.push({
        id: career.id,
        name: career.name,
        position: career.position,
        active: Boolean(career.is_active),
        ...(usage ? { usage: usage.get(career.name.toLowerCase()) || 0 } : {})
      });
    }

    return groups.map((group) => ({
      id: group.id,
      label: group.label,
      position: group.position,
      careers: byGroup.get(group.id) || []
    }));
  }

  /**
   * Cuántas fichas usan cada nombre de carrera, contando leads y proyectos.
   * La clave del Map es el nombre en minúsculas: los datos viejos vienen del
   * texto libre del formulario de Meta y no siempre respetan las mayúsculas.
   */
  async countUsage() {
    const totals = new Map();
    for (const { table, column } of CAREER_USAGE_TABLES) {
      const rows = await db(table).select(column).count('* as total').groupBy(column);
      for (const row of rows) {
        const key = String(row[column] || '').trim().toLowerCase();
        if (!key) continue;
        totals.set(key, (totals.get(key) || 0) + Number(row.total));
      }
    }
    return totals;
  }

  // ---------------------------------------------------------------- áreas

  async getGroupById(id) {
    return db('career_groups').where({ id }).first();
  }

  async createGroup(label) {
    const clean = cleanName(label);
    if (!clean) throw new Error('El nombre del área es obligatorio.');

    const duplicate = await db('career_groups').whereRaw('LOWER(label) = ?', [clean.toLowerCase()]).first();
    if (duplicate) throw new Error(`Ya existe un área llamada "${duplicate.label}".`);

    const max = await db('career_groups').max('position as max').first();
    const [id] = await db('career_groups').insert({ label: clean, position: (max?.max ?? -1) + 1 });
    return this.getGroupById(id);
  }

  async renameGroup(id, label) {
    const group = await this.getGroupById(id);
    if (!group) return null;

    const clean = cleanName(label);
    if (!clean) throw new Error('El nombre del área es obligatorio.');

    const duplicate = await db('career_groups')
      .whereRaw('LOWER(label) = ?', [clean.toLowerCase()])
      .whereNot({ id })
      .first();
    if (duplicate) throw new Error(`Ya existe un área llamada "${duplicate.label}".`);

    await db('career_groups').where({ id }).update({ label: clean, updated_at: db.fn.now() });
    return this.getGroupById(id);
  }

  /**
   * Borra un área vacía. Con carreras dentro se rechaza a propósito: el
   * `onDelete('CASCADE')` se las llevaría en silencio y el equipo perdería de
   * golpe una lista entera sin haberlo pedido.
   */
  async deleteGroup(id) {
    const group = await this.getGroupById(id);
    if (!group) return null;

    const [{ total }] = await db('careers').where({ group_id: id }).count('* as total');
    if (Number(total) > 0) {
      throw new Error(`"${group.label}" todavía tiene ${total} carrera(s). Muévelas o elimínalas antes de borrar el área.`);
    }

    await db('career_groups').where({ id }).del();
    return group;
  }

  async reorderGroups(orderedIds) {
    await Promise.all(
      orderedIds.map((id, index) => db('career_groups').where({ id }).update({ position: index }))
    );
    return this.listCatalog({ includeInactive: true, withUsage: true });
  }

  // -------------------------------------------------------------- carreras

  async getCareerById(id) {
    return db('careers').where({ id }).first();
  }

  async createCareer({ groupId, name }) {
    const group = await this.getGroupById(groupId);
    if (!group) throw new Error('El área indicada no existe.');

    const clean = cleanName(name);
    if (!clean) throw new Error('El nombre de la carrera es obligatorio.');

    const duplicate = await db('careers').whereRaw('LOWER(name) = ?', [clean.toLowerCase()]).first();
    if (duplicate) {
      const other = await this.getGroupById(duplicate.group_id);
      throw new Error(`"${duplicate.name}" ya está en el catálogo${other ? ` (área "${other.label}")` : ''}.`);
    }

    const max = await db('careers').where({ group_id: group.id }).max('position as max').first();
    const [id] = await db('careers').insert({
      group_id: group.id,
      name: clean,
      position: (max?.max ?? -1) + 1
    });
    return this.getCareerById(id);
  }

  /**
   * Renombra, mueve de área y/o vuelve a activar una carrera.
   *
   * @param {{ name?: string, groupId?: number, active?: boolean, propagate?: boolean }} changes
   *   `propagate` reescribe el nombre en los leads y proyectos que tenían el
   *   anterior — es lo que se espera al corregir un nombre mal escrito. Los
   *   documentos ya emitidos quedan intactos (ver la nota de arriba).
   * @returns {Promise<{ career: object, renamedRows: number } | null>}
   */
  async updateCareer(id, { name, groupId, active, propagate = false } = {}) {
    const career = await this.getCareerById(id);
    if (!career) return null;

    const payload = {};

    if (name !== undefined) {
      const clean = cleanName(name);
      if (!clean) throw new Error('El nombre de la carrera es obligatorio.');
      const duplicate = await db('careers')
        .whereRaw('LOWER(name) = ?', [clean.toLowerCase()])
        .whereNot({ id })
        .first();
      if (duplicate) throw new Error(`"${duplicate.name}" ya está en el catálogo.`);
      payload.name = clean;
    }

    if (groupId !== undefined && Number(groupId) !== career.group_id) {
      const group = await this.getGroupById(groupId);
      if (!group) throw new Error('El área indicada no existe.');
      const max = await db('careers').where({ group_id: group.id }).max('position as max').first();
      payload.group_id = group.id;
      payload.position = (max?.max ?? -1) + 1;
    }

    if (active !== undefined) payload.is_active = Boolean(active);

    let renamedRows = 0;
    if (Object.keys(payload).length > 0) {
      payload.updated_at = db.fn.now();
      await db('careers').where({ id }).update(payload);
    }

    if (propagate && payload.name && payload.name !== career.name) {
      renamedRows = await this.renameInRecords(career.name, payload.name);
    }

    return { career: await this.getCareerById(id), renamedRows };
  }

  /** Reescribe el nombre de la carrera en leads y proyectos. */
  async renameInRecords(oldName, newName) {
    let total = 0;
    for (const { table, column } of CAREER_USAGE_TABLES) {
      total += await db(table)
        .whereRaw(`LOWER(${column}) = ?`, [oldName.toLowerCase()])
        .update({ [column]: newName });
    }
    return total;
  }

  /**
   * Saca la carrera del catálogo. Los leads y proyectos que la usaban
   * conservan el texto: el desplegable lo vuelve a mostrar como "Registrado
   * anteriormente" para no cambiarle la carrera a nadie al guardar.
   */
  async deleteCareer(id) {
    const career = await this.getCareerById(id);
    if (!career) return null;
    await db('careers').where({ id }).del();
    return career;
  }

  async reorderCareers(groupId, orderedIds) {
    await Promise.all(
      orderedIds.map((id, index) => db('careers').where({ id, group_id: groupId }).update({ position: index }))
    );
    return this.listCatalog({ includeInactive: true, withUsage: true });
  }
}
