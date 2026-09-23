import { db } from '../db/connection.js';

/**
 * Notas/observaciones internas de un lead: la bitácora que deja el setter o el
 * closer para saber en qué se quedó cada conversación.
 *
 * No se confunden con `leads.additional_notes`, que es texto que escribe el
 * propio prospecto en el evaluador de tesis. Estas son del equipo, llevan autor
 * y fecha, y se acumulan — nunca se sobrescriben.
 */

/** Tope de caracteres por nota: una observación, no un informe. */
const MAX_BODY_LENGTH = 2000;

export class LeadNoteService {
  /** Notas de un lead, de la más reciente a la más antigua. */
  async listForLead(leadId) {
    const rows = await db('lead_notes')
      .leftJoin('users', 'users.id', 'lead_notes.author_id')
      .where('lead_notes.lead_id', leadId)
      .orderBy('lead_notes.created_at', 'desc')
      .orderBy('lead_notes.id', 'desc')
      .select(
        'lead_notes.id',
        'lead_notes.lead_id',
        'lead_notes.author_id',
        'lead_notes.body',
        'lead_notes.created_at',
        // El nombre vivo del usuario manda sobre la copia: si alguien se cambió
        // el nombre, la bitácora lo refleja. La copia es el respaldo para
        // cuando el usuario ya no existe.
        db.raw('COALESCE(users.name, lead_notes.author_name) as author_name')
      );

    return rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      authorId: r.author_id,
      authorName: r.author_name || 'Usuario eliminado',
      body: r.body,
      createdAt: r.created_at
    }));
  }

  /**
   * Agrega una nota. `author` es el `req.user` del token: se guarda su id y una
   * copia de su nombre (ver la migración).
   */
  async create(leadId, { body, author } = {}) {
    const text = String(body || '').trim();
    if (!text) {
      const e = new Error('La nota no puede estar vacía.');
      e.code = 'EMPTY_NOTE';
      throw e;
    }
    if (text.length > MAX_BODY_LENGTH) {
      const e = new Error(`La nota no puede pasar de ${MAX_BODY_LENGTH} caracteres.`);
      e.code = 'NOTE_TOO_LONG';
      throw e;
    }

    const lead = await db('leads').where({ id: leadId }).first('id');
    if (!lead) {
      const e = new Error('El lead no existe.');
      e.code = 'LEAD_NOT_FOUND';
      throw e;
    }

    const [id] = await db('lead_notes').insert({
      lead_id: leadId,
      author_id: author?.id || null,
      author_name: author?.name || null,
      body: text
    });

    const rows = await this.listForLead(leadId);
    return rows.find((n) => n.id === id) || null;
  }

  /**
   * Borra una nota. Sólo puede hacerlo quien la escribió o alguien con
   * `roles.manage`: una bitácora que cualquiera puede limpiar no sirve como
   * registro de lo que pasó con el lead.
   */
  async remove(noteId, { userId, canManage = false } = {}) {
    const note = await db('lead_notes').where({ id: noteId }).first();
    if (!note) {
      const e = new Error('La nota no existe.');
      e.code = 'NOTE_NOT_FOUND';
      throw e;
    }
    if (!canManage && note.author_id !== userId) {
      const e = new Error('Sólo puedes borrar tus propias notas.');
      e.code = 'FORBIDDEN';
      throw e;
    }
    await db('lead_notes').where({ id: noteId }).del();
    return { leadId: note.lead_id };
  }
}
