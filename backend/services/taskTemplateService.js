import { db } from '../db/connection.js';

/**
 * Plantillas de tareas: conjuntos de tareas guardados con un nombre (y, si
 * corresponde, la universidad a la que pertenecen) para importarlos en un
 * proyecto nuevo en vez de tipear la misma lista cada vez.
 *
 * Al importar se copian las tareas al proyecto; la plantilla no queda
 * vinculada. Ver la nota de la migración `20261016000000_create_task_templates`.
 */

/** Título de tarea utilizable: sin vacíos, sin duplicados y en orden. */
function normalizeItems(items) {
  const seen = new Set();
  return (items || [])
    .map((item) => String(typeof item === 'string' ? item : item?.title || '').trim())
    .filter((title) => {
      if (!title) return false;
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
}

function cleanText(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

export class TaskTemplateService {
  /** Adjunta a cada plantilla sus tareas, en orden. */
  async #attachItems(templates) {
    if (templates.length === 0) return templates;
    const items = await db('task_template_items')
      .whereIn('template_id', templates.map((t) => t.id))
      .orderBy('position', 'asc')
      .orderBy('id', 'asc');

    const byTemplate = new Map();
    for (const item of items) {
      if (!byTemplate.has(item.template_id)) byTemplate.set(item.template_id, []);
      byTemplate.get(item.template_id).push(item);
    }
    return templates.map((template) => ({ ...template, items: byTemplate.get(template.id) || [] }));
  }

  /**
   * Busca plantillas por nombre y/o universidad. El listado sale ordenado por
   * uso: lo que el equipo importa seguido queda arriba.
   */
  async listTemplates({ search, university } = {}) {
    const query = db('task_templates')
      .leftJoin('users', 'users.id', 'task_templates.created_by')
      .select('task_templates.*', 'users.name as created_by_name')
      .orderBy('task_templates.times_used', 'desc')
      .orderBy('task_templates.name', 'asc');

    const term = cleanText(search, 100);
    if (term) query.where('task_templates.name', 'like', `%${term}%`);

    const uni = cleanText(university, 255);
    if (uni) query.where('task_templates.university', 'like', `%${uni}%`);

    return this.#attachItems(await query);
  }

  async getTemplateById(id) {
    const template = await db('task_templates')
      .leftJoin('users', 'users.id', 'task_templates.created_by')
      .select('task_templates.*', 'users.name as created_by_name')
      .where('task_templates.id', id)
      .first();
    if (!template) return null;
    const [withItems] = await this.#attachItems([template]);
    return withItems;
  }

  /** Universidades ya usadas en alguna plantilla, para el filtro de búsqueda. */
  async listUniversities() {
    const rows = await db('task_templates')
      .whereNotNull('university')
      .where('university', '!=', '')
      .distinct('university')
      .orderBy('university', 'asc');
    return rows.map((row) => row.university);
  }

  async createTemplate({ name, university, academicLevel, items, createdBy }) {
    const cleanName = cleanText(name, 200);
    if (!cleanName) throw new Error('El nombre de la plantilla es requerido.');

    const titles = normalizeItems(items);
    if (titles.length === 0) throw new Error('La plantilla necesita al menos una tarea.');

    const [id] = await db('task_templates').insert({
      name: cleanName,
      university: cleanText(university, 255),
      academic_level: cleanText(academicLevel, 100),
      created_by: createdBy || null
    });
    await db('task_template_items').insert(titles.map((title, index) => ({
      template_id: id,
      title,
      position: index
    })));
    return this.getTemplateById(id);
  }

  /**
   * Guarda las tareas que ya tiene un proyecto como plantilla nueva: es la
   * forma natural de crear una, porque el esquema bueno se descubre trabajando
   * un proyecto, no escribiendo una lista en abstracto.
   */
  async createTemplateFromProject(projectId, { name, university, academicLevel, createdBy }) {
    const tasks = await db('tasks').where({ project_id: projectId }).orderBy('created_at', 'asc').orderBy('id', 'asc');
    if (tasks.length === 0) throw new Error('Este proyecto todavía no tiene tareas que guardar.');
    return this.createTemplate({
      name,
      university,
      academicLevel,
      items: tasks.map((task) => task.title),
      createdBy
    });
  }

  /** Reemplaza los datos y la lista completa de tareas de una plantilla. */
  async updateTemplate(id, { name, university, academicLevel, items }) {
    const template = await db('task_templates').where({ id }).first();
    if (!template) return null;

    const changes = { updated_at: db.fn.now() };
    if (name !== undefined) {
      const cleanName = cleanText(name, 200);
      if (!cleanName) throw new Error('El nombre de la plantilla es requerido.');
      changes.name = cleanName;
    }
    if (university !== undefined) changes.university = cleanText(university, 255);
    if (academicLevel !== undefined) changes.academic_level = cleanText(academicLevel, 100);
    await db('task_templates').where({ id }).update(changes);

    if (items !== undefined) {
      const titles = normalizeItems(items);
      if (titles.length === 0) throw new Error('La plantilla necesita al menos una tarea.');
      await db('task_template_items').where({ template_id: id }).del();
      await db('task_template_items').insert(titles.map((title, index) => ({
        template_id: id,
        title,
        position: index
      })));
    }
    return this.getTemplateById(id);
  }

  async deleteTemplate(id) {
    return db('task_templates').where({ id }).del();
  }

  /**
   * Copia las tareas de la plantilla al proyecto. Las que ya existen con el
   * mismo título se saltan, así importar dos veces (o importar una plantilla
   * parecida) no deja la lista duplicada.
   */
  async applyToProject(templateId, projectId) {
    const template = await this.getTemplateById(templateId);
    if (!template) throw new Error('Plantilla no encontrada.');

    const existing = await db('tasks').where({ project_id: projectId }).select('title');
    const taken = new Set(existing.map((task) => task.title.trim().toLowerCase()));

    const rows = template.items
      .filter((item) => !taken.has(item.title.trim().toLowerCase()))
      .map((item) => ({ project_id: projectId, title: item.title, status: 'pendiente' }));

    if (rows.length > 0) await db('tasks').insert(rows);
    await db('task_templates').where({ id: templateId }).increment('times_used', 1);

    return {
      imported: rows.length,
      skipped: template.items.length - rows.length,
      tasks: await db('tasks').where({ project_id: projectId }).orderBy('created_at', 'asc').orderBy('id', 'asc')
    };
  }
}
