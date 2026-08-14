import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { OllamaService } from './services/ollamaService.js';
import { EmailService } from './services/emailService.js';
import { LeadService } from './services/leadService.js';
import { ProjectService } from './services/projectService.js';
import { TaskService } from './services/taskService.js';
import { QuoteService } from './services/quoteService.js';
import { UserService } from './services/userService.js';
import { RoleService } from './services/roleService.js';
import { ProjectUpdateService } from './services/projectUpdateService.js';
import { signToken, requireAuth, requirePermission } from './middleware/auth.js';
import { uploadProjectUpdateAttachment, uploadDir } from './middleware/upload.js';

// Estado del funnel Kanban que marca el fin del proceso comercial: al llegar
// aquí se genera automáticamente el proyecto asociado al lead.
const FUNNEL_FINAL_STATUS = 'ganado';

// Etapas del funnel en las que un lead ya puede recibir una cotización.
const QUOTE_ELIGIBLE_STATUSES = ['contactado', 'en_negociacion'];

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Instanciar servicios
const ollamaService = new OllamaService();
const emailService = new EmailService();
const leadService = new LeadService();
const projectService = new ProjectService();
const taskService = new TaskService();
const quoteService = new QuoteService();
const userService = new UserService();
const roleService = new RoleService();
const projectUpdateService = new ProjectUpdateService();

// Historial en memoria de evaluaciones recientes
const evaluationHistory = [];

// API Endpoints

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Evaluador de Tesis Node.js + Ollama + Vue',
    timestamp: new Date().toISOString()
  });
});

/**
 * Login: valida credenciales y emite un JWT con los permisos del usuario
 * (rol → herramientas habilitadas: Panel de Leads, Proyectos, Roles y Permisos).
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son requeridos.' });
    }

    const userRow = await userService.getUserByEmail(email.trim());
    if (!userRow) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const passwordMatches = await userService.verifyPassword(userRow, password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = await userService.getUserWithPermissions(userRow.id);
    const token = signToken(user);

    console.log(`🔐 [Auth] Login exitoso: ${user.email} (${user.role})`);
    res.json({ token, user });
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión.', details: error.message });
  }
});

/**
 * Devuelve el usuario autenticado actual (para restaurar sesión / validar token)
 */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await userService.getUserWithPermissions(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ user });
  } catch (error) {
    console.error('❌ Error al obtener el usuario actual:', error);
    res.status(500).json({ error: 'Error al obtener el usuario actual.', details: error.message });
  }
});

/**
 * Evalúa el tema de tesis con Ollama Embeddings + LLM y lo envía por Correo Electrónico
 */
app.post('/api/evaluate', async (req, res) => {
  try {
    const {
      topic,
      academicLevel = 'Pregrado',
      fieldOfStudy = 'Ingeniería y Tecnología',
      email,
      phone,
      additionalNotes = '',
      apiKeyOverride = null,
      hostOverride = null
    } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'El tema de tesis es requerido.' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Proporcione una dirección de correo electrónico válida.' });
    }

    if (!phone || phone.trim().length < 6) {
      return res.status(400).json({ error: 'Proporcione un número de celular válido.' });
    }

    console.log(`\n🔍 Procesando nueva evaluación de tesis...`);
    console.log(`- Tema: "${topic}"`);
    console.log(`- Nivel: ${academicLevel} | Área: ${fieldOfStudy}`);
    console.log(`- Correo destinatario: ${email}`);
    console.log(`- Celular: ${phone}`);

    // Step 1: Evaluación con Ollama Cloud (Embedding + LLM)
    const reportData = await ollamaService.evaluateThesisViability({
      topic,
      academicLevel,
      fieldOfStudy,
      additionalNotes,
      apiKeyOverride,
      hostOverride
    });

    // Step 2: Envío por correo electrónico con Nodemailer
    const emailStatus = await emailService.sendReportEmail(email, reportData);

    // Guardar en historial
    const historyEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      topic,
      academicLevel,
      fieldOfStudy,
      email,
      phone,
      overallViabilityScore: reportData.evaluation.overallViabilityScore,
      viabilityLevel: reportData.evaluation.viabilityLevel,
      timestamp: reportData.timestamp,
      emailStatus: {
        success: emailStatus.success,
        mode: emailStatus.mode,
        previewUrl: emailStatus.previewUrl
      }
    };
    evaluationHistory.unshift(historyEntry);

    // Limitar historial a los últimos 20 ítems
    if (evaluationHistory.length > 20) evaluationHistory.pop();

    // Step 3: Registrar el lead en MySQL para el funnel de ventas
    // (no bloquea la respuesta al usuario si la base de datos no está disponible)
    let lead = null;
    try {
      lead = await leadService.createLead({
        topic,
        academicLevel,
        fieldOfStudy,
        email,
        phone,
        additionalNotes,
        overallViabilityScore: reportData.evaluation.overallViabilityScore,
        viabilityLevel: reportData.evaluation.viabilityLevel
      });
      console.log(`💾 [Leads] Lead #${lead.id} registrado en MySQL (${email})`);
    } catch (dbError) {
      console.warn('⚠️ [Leads] No se pudo registrar el lead en MySQL:', dbError.message);
    }

    res.json({
      success: true,
      report: reportData,
      emailStatus,
      lead
    });

  } catch (error) {
    console.error('❌ Error general en evaluación:', error);
    res.status(500).json({
      error: 'Error en el servidor al evaluar el tema de tesis.',
      details: error.message
    });
  }
});

/**
 * Obtener historial de evaluaciones
 */
app.get('/api/history', (req, res) => {
  res.json({
    total: evaluationHistory.length,
    history: evaluationHistory
  });
});

/**
 * Listado de leads registrados (vista de administración / funnel de ventas / base de datos)
 */
app.get('/api/leads', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const leads = await leadService.getAllLeads();
    res.json({ total: leads.length, leads });
  } catch (error) {
    console.error('❌ Error al obtener leads:', error);
    res.status(500).json({ error: 'Error al obtener los leads desde la base de datos.', details: error.message });
  }
});

/**
 * Registro manual de nuevo lead / prospecto desde el formulario de Base de Datos
 */
app.post('/api/leads', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const { fullName, full_name, phone } = req.body;
    const name = fullName || full_name;
    if (!name || !phone) {
      return res.status(400).json({ error: 'El nombre completo y el número de celular son requeridos.' });
    }

    const prospect = await leadService.createProspect(req.body);
    console.log(`👤 [Prospectos] Nuevo prospecto registrado #${prospect.id} (${name})`);
    res.status(201).json({ prospect, lead: prospect, message: 'Prospecto registrado exitosamente.' });
  } catch (error) {
    console.error('❌ Error al registrar prospecto:', error);
    res.status(500).json({ error: 'Error al registrar el prospecto.', details: error.message });
  }
});


/**
 * Detalle de un lead específico
 */
app.get('/api/leads/:id', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }
    res.json({ lead });
  } catch (error) {
    console.error('❌ Error al obtener el lead:', error);
    res.status(500).json({ error: 'Error al obtener el lead desde la base de datos.', details: error.message });
  }
});

/**
 * Actualizar el estado de seguimiento comercial de un lead (columna del Kanban).
 * Al llegar al estado final del funnel ("ganado") se crea automáticamente el
 * proyecto asociado, con estado "Creado".
 */
app.patch('/api/leads/:id/status', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'El estado (status) es requerido.' });
    }

    const lead = await leadService.updateLeadStatus(req.params.id, status);
    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }

    let project = null;
    if (status === FUNNEL_FINAL_STATUS) {
      project = await projectService.createProjectFromLead(lead);
      console.log(`🚀 [Proyectos] Proyecto #${project.id} creado a partir del lead #${lead.id} (estado: Creado)`);
    }

    res.json({ lead, project });
  } catch (error) {
    console.error('❌ Error al actualizar el lead:', error);
    res.status(500).json({ error: 'Error al actualizar el lead.', details: error.message });
  }
});

/**
 * Actualizar datos completos de un lead / prospecto (desde el modal de Base de Datos)
 */
app.put('/api/leads/:id', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const updated = await leadService.updateLead(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }
    console.log(`✏️ [Prospectos] Prospecto actualizado #${req.params.id}`);
    res.json({ lead: updated, message: 'Prospecto actualizado exitosamente.' });
  } catch (error) {
    console.error('❌ Error al actualizar prospecto:', error);
    res.status(500).json({ error: 'Error al actualizar el prospecto.', details: error.message });
  }
});

/**
 * Eliminar un lead / prospecto
 */
app.delete('/api/leads/:id', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const deleted = await leadService.deleteLead(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }
    console.log(`🗑️ [Prospectos] Prospecto eliminado #${req.params.id}`);
    res.json({ success: true, message: 'Prospecto eliminado exitosamente.' });
  } catch (error) {
    console.error('❌ Error al eliminar prospecto:', error);
    res.status(500).json({ error: 'Error al eliminar el prospecto.', details: error.message });
  }
});


/**
 * Genera y envía por correo una cotización para un lead en etapa
 * "contactado" o "en_negociacion" del funnel de ventas.
 */
app.post('/api/leads/:id/quote', requireAuth, requirePermission('leads.view'), async (req, res) => {
  try {
    const { amount, currency = 'PEN', notes } = req.body;
    const parsedAmount = Number(amount);

    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Proporcione un monto válido para la cotización.' });
    }

    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado.' });
    }

    if (!QUOTE_ELIGIBLE_STATUSES.includes(lead.status)) {
      return res.status(400).json({ error: 'Solo se puede cotizar a leads en estado "Contactado" o "En Negociación".' });
    }

    const quote = await quoteService.createQuote({ leadId: lead.id, amount: parsedAmount, currency, notes });
    const emailStatus = await emailService.sendQuoteEmail(lead.email, { topic: lead.topic, amount: parsedAmount, currency, notes });

    console.log(`💰 [Cotizaciones] Cotización #${quote.id} generada para el lead #${lead.id} (${lead.email})`);

    res.json({ quote, emailStatus });
  } catch (error) {
    console.error('❌ Error al generar la cotización:', error);
    res.status(500).json({ error: 'Error al generar la cotización.', details: error.message });
  }
});

/**
 * Directorio ligero de usuarios internos, para asignar líder/colaboradores a
 * un proyecto (no requiere el permiso roles.manage, a diferencia de /api/users).
 */
app.get('/api/team-directory', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const users = await userService.listDirectory();
    res.json({ users });
  } catch (error) {
    console.error('❌ Error al obtener el directorio de equipo:', error);
    res.status(500).json({ error: 'Error al obtener el directorio de equipo.', details: error.message });
  }
});

/**
 * Listado de proyectos generados a partir de leads ganados
 */
app.get('/api/projects', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const projects = await projectService.getAllProjects();
    res.json({ total: projects.length, projects });
  } catch (error) {
    console.error('❌ Error al obtener proyectos:', error);
    res.status(500).json({ error: 'Error al obtener los proyectos desde la base de datos.', details: error.message });
  }
});

/**
 * Crear un proyecto manualmente (sin que provenga de un lead ganado en el funnel)
 */
app.post('/api/projects', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { topic, clientEmail, clientPhone, academicLevel, fieldOfStudy, deadline } = req.body;

    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: 'El tema/nombre del proyecto es requerido.' });
    }
    if (!clientEmail || !clientEmail.includes('@')) {
      return res.status(400).json({ error: 'Proporcione un correo de cliente válido.' });
    }
    if (!clientPhone || !clientPhone.trim()) {
      return res.status(400).json({ error: 'El celular del cliente es requerido.' });
    }
    if (!academicLevel || !academicLevel.trim()) {
      return res.status(400).json({ error: 'El nivel académico es requerido.' });
    }
    if (!fieldOfStudy || !fieldOfStudy.trim()) {
      return res.status(400).json({ error: 'La carrera / campo de estudio es requerido.' });
    }

    const project = await projectService.createManualProject({
      topic: topic.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      academicLevel: academicLevel.trim(),
      fieldOfStudy: fieldOfStudy.trim(),
      deadline
    });

    console.log(`🚀 [Proyectos] Proyecto #${project.id} creado manualmente (sin lead asociado)`);
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al crear el proyecto:', error);
    res.status(500).json({ error: 'Error al crear el proyecto.', details: error.message });
  }
});

/**
 * Actualizar el estado de ejecución de un proyecto
 */
app.patch('/api/projects/:id/status', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'El estado (status) es requerido.' });
    }
    const project = await projectService.updateProjectStatus(req.params.id, status);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al actualizar el proyecto:', error);
    res.status(500).json({ error: 'Error al actualizar el proyecto.', details: error.message });
  }
});

/**
 * Establecer o limpiar el plazo (deadline) de un proyecto
 */
app.patch('/api/projects/:id/deadline', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { deadline } = req.body;
    const project = await projectService.updateDeadline(req.params.id, deadline);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al actualizar el plazo del proyecto:', error);
    res.status(500).json({ error: 'Error al actualizar el plazo del proyecto.', details: error.message });
  }
});

/**
 * Asignar (o quitar) el líder responsable de un proyecto
 */
app.patch('/api/projects/:id/leader', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { userId } = req.body;
    const project = await projectService.updateLeader(req.params.id, userId);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al asignar el líder del proyecto:', error);
    res.status(500).json({ error: 'Error al asignar el líder del proyecto.', details: error.message });
  }
});

/**
 * Agregar un colaborador a un proyecto
 */
app.post('/api/projects/:id/collaborators', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido.' });
    }
    const project = await projectService.addCollaborator(req.params.id, userId);
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al agregar el colaborador:', error);
    res.status(500).json({ error: 'Error al agregar el colaborador.', details: error.message });
  }
});

/**
 * Quitar un colaborador de un proyecto
 */
app.delete('/api/projects/:id/collaborators/:userId', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const project = await projectService.removeCollaborator(req.params.id, req.params.userId);
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al quitar el colaborador:', error);
    res.status(500).json({ error: 'Error al quitar el colaborador.', details: error.message });
  }
});

/**
 * Detalle de un proyecto específico (incluye % de avance)
 */
app.get('/api/projects/:id', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const project = await projectService.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    res.json({ project });
  } catch (error) {
    console.error('❌ Error al obtener el proyecto:', error);
    res.status(500).json({ error: 'Error al obtener el proyecto desde la base de datos.', details: error.message });
  }
});

/**
 * Listado de tareas de un proyecto (checklist + tablero Kanban)
 */
app.get('/api/projects/:id/tasks', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const tasks = await taskService.getTasksByProject(req.params.id);
    res.json({ total: tasks.length, tasks });
  } catch (error) {
    console.error('❌ Error al obtener las tareas:', error);
    res.status(500).json({ error: 'Error al obtener las tareas del proyecto.', details: error.message });
  }
});

/**
 * Crear una nueva tarea para un proyecto
 */
app.post('/api/projects/:id/tasks', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'El título de la tarea es requerido.' });
    }
    const task = await taskService.createTask(req.params.id, title.trim());
    res.json({ task });
  } catch (error) {
    console.error('❌ Error al crear la tarea:', error);
    res.status(500).json({ error: 'Error al crear la tarea.', details: error.message });
  }
});

/**
 * Actualizar el estado de una tarea (columna del Kanban de tareas)
 */
app.patch('/api/tasks/:id/status', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'El estado (status) es requerido.' });
    }
    const task = await taskService.updateTaskStatus(req.params.id, status);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada.' });
    }
    res.json({ task });
  } catch (error) {
    console.error('❌ Error al actualizar la tarea:', error);
    res.status(500).json({ error: 'Error al actualizar la tarea.', details: error.message });
  }
});

/**
 * Eliminar una tarea
 */
app.delete('/api/tasks/:id', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    await taskService.deleteTask(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error al eliminar la tarea:', error);
    res.status(500).json({ error: 'Error al eliminar la tarea.', details: error.message });
  }
});

/**
 * Línea de tiempo: listado de hitos/actualizaciones de un proyecto
 */
app.get('/api/projects/:id/updates', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const updates = await projectUpdateService.getUpdatesByProject(req.params.id);
    res.json({ total: updates.length, updates });
  } catch (error) {
    console.error('❌ Error al obtener la línea de tiempo:', error);
    res.status(500).json({ error: 'Error al obtener la línea de tiempo del proyecto.', details: error.message });
  }
});

/**
 * Publicar un nuevo hito en la línea de tiempo (texto y, opcionalmente, un
 * documento adjunto vía multipart/form-data, campo "attachment").
 */
app.post('/api/projects/:id/updates', requireAuth, requirePermission('projects.view'), uploadProjectUpdateAttachment, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El contenido de la actualización es requerido.' });
    }
    const update = await projectUpdateService.createUpdate({
      projectId: req.params.id,
      authorId: req.user.id,
      content: content.trim(),
      attachment: req.file || null
    });
    res.json({ update });
  } catch (error) {
    console.error('❌ Error al publicar la actualización:', error);
    res.status(500).json({ error: 'Error al publicar la actualización.', details: error.message });
  }
});

/**
 * Descarga del documento adjunto de una actualización (requiere sesión y
 * permiso projects.view, igual que el resto del módulo de proyectos)
 */
app.get('/api/project-updates/:id/attachment', requireAuth, requirePermission('projects.view'), async (req, res) => {
  try {
    const update = await projectUpdateService.getUpdateById(req.params.id);
    if (!update || !update.attachment_filename) {
      return res.status(404).json({ error: 'Adjunto no encontrado.' });
    }
    const filePath = path.join(uploadDir, update.attachment_filename);
    res.download(filePath, update.attachment_original_name || update.attachment_filename);
  } catch (error) {
    console.error('❌ Error al descargar el adjunto:', error);
    res.status(500).json({ error: 'Error al descargar el adjunto.', details: error.message });
  }
});

/**
 * Listado de roles con sus permisos (herramientas habilitadas)
 */
app.get('/api/roles', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const roles = await roleService.listRoles();
    res.json({ roles });
  } catch (error) {
    console.error('❌ Error al obtener roles:', error);
    res.status(500).json({ error: 'Error al obtener los roles.', details: error.message });
  }
});

/**
 * Crear un nuevo rol
 */
app.post('/api/roles', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del rol es requerido.' });
    }
    const role = await roleService.createRole({ name: name.trim(), description });
    res.json({ role });
  } catch (error) {
    console.error('❌ Error al crear el rol:', error);
    res.status(500).json({ error: 'Error al crear el rol. Verifica que el nombre no esté repetido.', details: error.message });
  }
});

/**
 * Reemplaza el conjunto completo de permisos (herramientas) de un rol
 */
app.put('/api/roles/:id/permissions', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'permissionIds debe ser un arreglo.' });
    }
    const role = await roleService.setRolePermissions(req.params.id, permissionIds);
    res.json({ role });
  } catch (error) {
    console.error('❌ Error al actualizar los permisos del rol:', error);
    res.status(500).json({ error: 'Error al actualizar los permisos del rol.', details: error.message });
  }
});

/**
 * Listado de permisos (herramientas internas existentes o por desarrollarse)
 */
app.get('/api/permissions', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const permissions = await roleService.listPermissions();
    res.json({ permissions });
  } catch (error) {
    console.error('❌ Error al obtener permisos:', error);
    res.status(500).json({ error: 'Error al obtener los permisos.', details: error.message });
  }
});

/**
 * Registrar una nueva herramienta (permiso), aunque su módulo aún no exista,
 * para poder asignarla a roles desde ya.
 */
app.post('/api/permissions', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const { key, label } = req.body;
    if (!key || !key.trim() || !label || !label.trim()) {
      return res.status(400).json({ error: 'La clave (key) y el nombre (label) de la herramienta son requeridos.' });
    }
    const permission = await roleService.createPermission({ key: key.trim(), label: label.trim() });
    res.json({ permission });
  } catch (error) {
    console.error('❌ Error al crear el permiso:', error);
    res.status(500).json({ error: 'Error al crear la herramienta. Verifica que la clave no esté repetida.', details: error.message });
  }
});

/**
 * Listado de usuarios internos
 */
app.get('/api/users', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const users = await userService.listUsers();
    res.json({ users });
  } catch (error) {
    console.error('❌ Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener los usuarios.', details: error.message });
  }
});

/**
 * Crear un nuevo usuario interno
 */
app.post('/api/users', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const { name, email, password, roleId } = req.body;
    if (!name || !email || !password || !roleId) {
      return res.status(400).json({ error: 'Nombre, correo, contraseña y rol son requeridos.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const user = await userService.createUser({ name: name.trim(), email: email.trim(), password, roleId });
    res.json({ user });
  } catch (error) {
    console.error('❌ Error al crear el usuario:', error);
    res.status(500).json({ error: 'Error al crear el usuario. Verifica que el correo no esté registrado.', details: error.message });
  }
});

/**
 * Reasignar el rol de un usuario
 */
app.patch('/api/users/:id/role', requireAuth, requirePermission('roles.manage'), async (req, res) => {
  try {
    const { roleId } = req.body;
    if (!roleId) {
      return res.status(400).json({ error: 'roleId es requerido.' });
    }
    const user = await userService.updateUserRole(req.params.id, roleId);
    res.json({ user });
  } catch (error) {
    console.error('❌ Error al actualizar el rol del usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el rol del usuario.', details: error.message });
  }
});

// Servir frontend en producción si existe dist/
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor de Evaluación de Tesis corriendo en http://localhost:${PORT}`);
  console.log(`- API Status: http://localhost:${PORT}/api/health`);
});
