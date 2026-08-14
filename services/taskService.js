import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para las tareas de un proyecto (lista de
 * pendientes + tablero Kanban).
 */
export class TaskService {
  async createTask(projectId, title) {
    const [id] = await db('tasks').insert({ project_id: projectId, title, status: 'pendiente' });
    return this.getTaskById(id);
  }

  async getTasksByProject(projectId) {
    return db('tasks').where({ project_id: projectId }).orderBy('created_at', 'asc');
  }

  async getTaskById(id) {
    return db('tasks').where({ id }).first();
  }

  async updateTaskStatus(id, status) {
    await db('tasks').where({ id }).update({ status });
    return this.getTaskById(id);
  }

  async deleteTask(id) {
    return db('tasks').where({ id }).del();
  }
}
