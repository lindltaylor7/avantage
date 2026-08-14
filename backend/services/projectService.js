import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para los proyectos generados automáticamente
 * cuando un lead alcanza el estado final del funnel de ventas ("ganado").
 */
export class ProjectService {
  async createProjectFromLead(lead) {
    const existing = await db('projects').where({ lead_id: lead.id }).first();
    if (existing) return existing;

    const [id] = await db('projects').insert({
      lead_id: lead.id,
      topic: lead.topic,
      client_email: lead.email,
      client_phone: lead.phone,
      academic_level: lead.academic_level,
      field_of_study: lead.field_of_study,
      status: 'Creado'
    });
    return this.getProjectById(id);
  }

  /**
   * Crea un proyecto manualmente, sin que provenga de un lead ganado en el funnel.
   */
  async createManualProject({ topic, clientEmail, clientPhone, academicLevel, fieldOfStudy, deadline }) {
    const [id] = await db('projects').insert({
      lead_id: null,
      topic,
      client_email: clientEmail,
      client_phone: clientPhone,
      academic_level: academicLevel,
      field_of_study: fieldOfStudy,
      deadline: deadline || null,
      status: 'Creado'
    });
    return this.getProjectById(id);
  }

  async getAllProjects() {
    const rows = await db('projects')
      .select(
        'projects.*',
        db.raw('COUNT(tasks.id) as total_tasks'),
        db.raw("SUM(CASE WHEN tasks.status = 'completado' THEN 1 ELSE 0 END) as completed_tasks")
      )
      .leftJoin('tasks', 'tasks.project_id', 'projects.id')
      .groupBy('projects.id')
      .orderBy('projects.created_at', 'desc');

    return rows.map(this.withProgress);
  }

  async getProjectById(id) {
    const [row] = await db('projects')
      .leftJoin('users as leader', 'leader.id', 'projects.leader_id')
      .select(
        'projects.*',
        db.raw('MAX(leader.name) as leader_name'),
        db.raw('COUNT(tasks.id) as total_tasks'),
        db.raw("SUM(CASE WHEN tasks.status = 'completado' THEN 1 ELSE 0 END) as completed_tasks")
      )
      .leftJoin('tasks', 'tasks.project_id', 'projects.id')
      .where('projects.id', id)
      .groupBy('projects.id');

    if (!row) return undefined;

    const collaborators = await this.getCollaborators(id);
    return { ...this.withProgress(row), collaborators };
  }

  async updateProjectStatus(id, status) {
    await db('projects').where({ id }).update({ status });
    return this.getProjectById(id);
  }

  async updateDeadline(id, deadline) {
    await db('projects').where({ id }).update({ deadline: deadline || null });
    return this.getProjectById(id);
  }

  async updateLeader(id, leaderId) {
    let validLeaderId = null;
    if (leaderId) {
      const userExists = await db('users').where({ id: leaderId }).first();
      if (userExists) validLeaderId = leaderId;
    }
    await db('projects').where({ id }).update({ leader_id: validLeaderId });
    return this.getProjectById(id);
  }

  async getCollaborators(projectId) {
    return db('project_collaborators')
      .join('users', 'users.id', 'project_collaborators.user_id')
      .where('project_collaborators.project_id', projectId)
      .select('users.id', 'users.name', 'users.email')
      .orderBy('users.name', 'asc');
  }

  async addCollaborator(projectId, userId) {
    if (userId) {
      const userExists = await db('users').where({ id: userId }).first();
      if (!userExists) {
        throw new Error('El usuario seleccionado ya no existe en el sistema.');
      }
    }
    const existing = await db('project_collaborators').where({ project_id: projectId, user_id: userId }).first();
    if (!existing) {
      await db('project_collaborators').insert({ project_id: projectId, user_id: userId });
    }
    return this.getProjectById(projectId);
  }

  async removeCollaborator(projectId, userId) {
    await db('project_collaborators').where({ project_id: projectId, user_id: userId }).del();
    return this.getProjectById(projectId);
  }

  withProgress(row) {
    const totalTasks = Number(row.total_tasks) || 0;
    const completedTasks = Number(row.completed_tasks) || 0;
    return {
      ...row,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    };
  }
}
