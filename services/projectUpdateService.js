import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para los hitos/actualizaciones publicados en la
 * línea de tiempo de un proyecto (texto + adjunto opcional).
 */
export class ProjectUpdateService {
  async createUpdate({ projectId, authorId, content, attachment }) {
    const [id] = await db('project_updates').insert({
      project_id: projectId,
      author_id: authorId || null,
      content,
      attachment_filename: attachment?.filename || null,
      attachment_original_name: attachment?.originalname || null,
      attachment_mime_type: attachment?.mimetype || null,
      attachment_size: attachment?.size || null
    });
    return this.getUpdateById(id);
  }

  async getUpdateById(id) {
    return db('project_updates')
      .leftJoin('users', 'users.id', 'project_updates.author_id')
      .where('project_updates.id', id)
      .select('project_updates.*', 'users.name as author_name')
      .first();
  }

  async getUpdatesByProject(projectId) {
    return db('project_updates')
      .leftJoin('users', 'users.id', 'project_updates.author_id')
      .where('project_updates.project_id', projectId)
      .select('project_updates.*', 'users.name as author_name')
      .orderBy('project_updates.created_at', 'desc');
  }
}
