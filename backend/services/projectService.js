import { db } from '../db/connection.js';

/**
 * Estado con el que nace un proyecto recién ganado, todavía sin el primer pago
 * verificado, y estado al que pasa cuando finanzas lo verifica.
 */
export const PROJECT_STATUS_LOCKED = 'Creado';
export const PROJECT_STATUS_ACTIVE = 'Activo';

/**
 * Añade a cada proyecto el pago inicial de su lead (`initial_payment`) y si eso
 * lo mantiene bloqueado (`is_locked`).
 *
 * El bloqueo se deriva del ingreso, no se guarda en el proyecto: así no hay dos
 * fuentes de verdad que puedan desincronizarse. Un proyecto sin pago inicial
 * registrado —los creados a mano y todos los anteriores a este flujo— no se
 * bloquea nunca.
 */
async function attachPaymentGate(rows) {
  if (rows.length === 0) return rows;
  const leadIds = rows.map((r) => r.lead_id).filter(Boolean);
  if (leadIds.length === 0) {
    return rows.map((r) => ({ ...r, initial_payment: null, is_locked: false }));
  }

  const payments = await db('finance_income')
    .whereIn('lead_id', leadIds)
    .where('is_initial_payment', true)
    .select('id', 'lead_id', 'code', 'monto', 'estado')
    .orderBy('id', 'asc');

  const byLead = new Map();
  for (const p of payments) {
    if (!byLead.has(p.lead_id)) byLead.set(p.lead_id, p);
  }

  return rows.map((row) => {
    const payment = row.lead_id ? byLead.get(row.lead_id) || null : null;
    return {
      ...row,
      initial_payment: payment,
      is_locked: Boolean(payment) && payment.estado !== 'verificado'
    };
  });
}

/**
 * Servicio de acceso a datos para los proyectos generados automáticamente
 * cuando un lead alcanza el estado final del funnel de ventas ("ganado").
 */
export class ProjectService {
  constructor({ clientAccountService, emailService } = {}) {
    this.clientAccountService = clientAccountService;
    this.emailService = emailService;
  }

  /**
   * Da de alta (si no existía) la cuenta del portal para el correo del
   * cliente y le manda la invitación por correo. Nunca debe tumbar la
   * creación del proyecto: cualquier falla acá solo se loguea, igual que el
   * resto de los efectos secundarios de notificación del sistema.
   */
  async #inviteClientToPortal(email, name) {
    if (!this.clientAccountService || !this.emailService || !email) return;
    try {
      const { account, isNew } = await this.clientAccountService.ensureAccountForEmail(email, name);
      if (!isNew) return;

      const activationUrl = `${(process.env.APP_BASE_URL || '').replace(/\/$/, '')}/portal/activar?token=${account.activation_token}`;
      const result = await this.emailService.sendClientPortalInviteEmail(account.email, { name, activationUrl });
      if (result?.success) {
        console.log(`📧 [Portal] Invitación enviada a ${account.email}${result.previewUrl ? ` (preview: ${result.previewUrl})` : ''}`);
      } else {
        console.warn(`⚠️ [Portal] No se pudo enviar la invitación a ${account.email}:`, result?.error);
      }
    } catch (error) {
      console.error(`❌ [Portal] Error al invitar al cliente ${email}:`, error.message);
    }
  }

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
    await this.#inviteClientToPortal(lead.email, lead.full_name);
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
    await this.#inviteClientToPortal(clientEmail, null);
    return this.getProjectById(id);
  }

  /** Proyectos del cliente autenticado en el portal, por su correo. */
  async getProjectsByClientEmail(email) {
    const rows = await db('projects')
      .select(
        'projects.*',
        db.raw('COUNT(tasks.id) as total_tasks'),
        db.raw("SUM(CASE WHEN tasks.status = 'completado' THEN 1 ELSE 0 END) as completed_tasks")
      )
      .leftJoin('tasks', 'tasks.project_id', 'projects.id')
      .where('projects.client_email', email)
      .groupBy('projects.id')
      .orderBy('projects.created_at', 'desc');

    return attachPaymentGate(rows.map(this.withProgress));
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

    return attachPaymentGate(rows.map(this.withProgress));
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
    const [withGate] = await attachPaymentGate([this.withProgress(row)]);
    return { ...withGate, collaborators };
  }

  /**
   * Puerta que usan las rutas que modifican un proyecto: mientras el primer
   * pago no esté verificado por finanzas, el proyecto se puede mirar pero no
   * gestionar. Devuelve el proyecto si se puede tocar; lanza si no.
   */
  async assertManageable(id) {
    const project = await this.getProjectById(id);
    if (!project) return null;
    if (project.is_locked) {
      const monto = Number(project.initial_payment?.monto || 0).toFixed(2);
      const error = new Error(
        `Este proyecto está a la espera de que Finanzas verifique el primer pago (S/ ${monto}). ` +
        'Hasta entonces solo se puede consultar.'
      );
      error.code = 'PROJECT_LOCKED';
      throw error;
    }
    return project;
  }

  /**
   * Sincroniza el estado del proyecto de un lead con la verificación de su
   * pago inicial. Solo mueve la pareja "Creado" ⇄ "Activo": si el equipo ya
   * avanzó el proyecto a otro estado, no se le toca.
   */
  async syncStatusWithPayment(leadId, { verified } = {}) {
    if (!leadId) return null;
    const project = await db('projects').where({ lead_id: leadId }).first();
    if (!project) return null;

    const from = verified ? PROJECT_STATUS_LOCKED : PROJECT_STATUS_ACTIVE;
    const to = verified ? PROJECT_STATUS_ACTIVE : PROJECT_STATUS_LOCKED;
    if (project.status !== from) return this.getProjectById(project.id);

    await db('projects').where({ id: project.id }).update({ status: to });
    return this.getProjectById(project.id);
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
