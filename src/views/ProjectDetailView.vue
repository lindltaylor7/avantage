<template>
  <main class="container" style="flex: 1; padding-top: 2rem; padding-bottom: 4rem;">
    <router-link to="/admin/projects" style="color: var(--accent-cyan); font-size: 0.85rem; text-decoration: none; display: inline-block; margin-bottom: 1rem;">
      ← Volver a Proyectos
    </router-link>

    <div v-if="loadError" class="info-box" style="border-color: rgba(244, 63, 94, 0.4); margin-bottom: 1.5rem;">
      <h4 style="color: var(--accent-rose);">⚠️ No se pudo cargar el proyecto</h4>
      <p>{{ loadError }}</p>
    </div>

    <div v-if="project">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
        <div>
          <h2 class="section-heading"><span>🚀</span> {{ project.topic }}</h2>
          <p class="section-subheading" style="margin-bottom: 0;">
            ✉️ {{ project.client_email }} | 📱 {{ project.client_phone }} | {{ project.academic_level }} — {{ project.field_of_study }}
          </p>
        </div>
        <span :class="['status-pill', statusClass(project.status)]" style="font-size: 0.85rem; padding: 0.35rem 0.9rem;">{{ project.status }}</span>
      </div>

      <!-- Equipo y Plazo -->
      <div class="glass-panel" style="padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
        <h3 style="font-size: 0.95rem; color: var(--accent-cyan); margin-bottom: 1rem;">👥 Equipo y Plazo</h3>

        <div class="team-grid">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">📅 Fecha límite</label>
            <div style="display: flex; gap: 0.5rem;">
              <input v-model="deadlineInput" type="date" class="form-input" style="border-radius: 10px;" />
              <button class="btn-secondary" style="white-space: nowrap;" @click="saveDeadline">Guardar</button>
            </div>
            <p v-if="isOverdue" style="color: var(--accent-rose); font-size: 0.78rem; margin-top: 0.4rem;">⚠️ Plazo vencido</p>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">🧭 Líder del Proyecto</label>
            <select :value="project.leader_id || ''" class="form-select" @change="saveLeader($event.target.value)">
              <option value="">Sin asignar</option>
              <option v-for="member in teamDirectory" :key="member.id" :value="member.id">{{ member.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: 1.1rem; margin-bottom: 0;">
          <label class="form-label">🤝 Colaboradores</label>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <span v-for="collaborator in project.collaborators" :key="collaborator.id" class="collaborator-chip">
              {{ collaborator.name }}
              <button type="button" title="Quitar colaborador" @click="removeCollaborator(collaborator.id)">✕</button>
            </span>
            <span v-if="!project.collaborators || project.collaborators.length === 0" style="color: var(--text-muted); font-size: 0.82rem;">
              Sin colaboradores asignados.
            </span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <select v-model="collaboratorToAdd" class="form-select">
              <option value="" disabled>Selecciona un colaborador para agregar</option>
              <option v-for="member in availableCollaborators" :key="member.id" :value="member.id">{{ member.name }}</option>
            </select>
            <button class="btn-secondary" style="white-space: nowrap;" :disabled="!collaboratorToAdd" @click="addCollaborator">Agregar</button>
          </div>
        </div>
      </div>

      <!-- Progreso del Proyecto -->
      <div class="glass-panel" style="padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="font-size: 0.95rem; color: var(--accent-cyan);">📈 Avance del Proyecto</h3>
          <strong style="color: var(--text-main);">{{ progressPercentage }}% ({{ completedCount }}/{{ tasks.length }} tareas)</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: progressPercentage + '%', background: progressColor(progressPercentage) }"></div>
        </div>
      </div>

      <!-- Tabs: Tareas / Línea de Tiempo -->
      <div class="tab-bar">
        <button type="button" class="tab-button" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
          🗂️ Tablero de Tareas
        </button>
        <button type="button" class="tab-button" :class="{ active: activeTab === 'timeline' }" @click="activeTab = 'timeline'">
          📅 Línea de Tiempo
        </button>
      </div>

      <div v-if="activeTab === 'tasks'">
        <!-- Agregar tarea (todo) -->
        <div class="glass-panel" style="padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
          <h3 style="font-size: 0.95rem; color: var(--accent-cyan); margin-bottom: 0.75rem;">📝 Agregar Tarea</h3>
          <form style="display: flex; gap: 0.6rem;" @submit.prevent="addTask">
            <input
              v-model="newTaskTitle"
              type="text"
              class="form-input"
              placeholder="Ej: Redactar marco teórico, capítulo 2..."
              style="border-radius: 10px;"
            />
            <button type="submit" class="btn-primary" style="width: auto; padding: 0 1.5rem; border-radius: 10px;" :disabled="!newTaskTitle.trim()">
              Agregar
            </button>
          </form>
        </div>

        <!-- Kanban de Tareas -->
        <div class="task-board">
          <div
            v-for="col in TASK_COLUMNS"
            :key="col.key"
            class="task-column"
            :class="{ 'is-drag-over': hoveredColumn === col.key }"
            @dragover.prevent="hoveredColumn = col.key"
            @dragleave="onColumnDragLeave(col.key)"
            @drop="onDrop(col.key)"
          >
            <div class="task-column-header">
              <span>{{ col.icon }} {{ col.label }}</span>
              <span class="kanban-count">{{ (tasksByColumn[col.key] || []).length }}</span>
            </div>

            <div class="task-column-body">
              <div
                v-for="task in tasksByColumn[col.key]"
                :key="task.id"
                class="task-card"
                draggable="true"
                @dragstart="onDragStart(task)"
                @dragend="hoveredColumn = null"
              >
                <label class="task-checkbox-row">
                  <input
                    type="checkbox"
                    :checked="task.status === 'completado'"
                    @change="toggleComplete(task, $event.target.checked)"
                  />
                  <span :style="{ textDecoration: task.status === 'completado' ? 'line-through' : 'none', opacity: task.status === 'completado' ? 0.6 : 1 }">
                    {{ task.title }}
                  </span>
                </label>
                <button class="task-delete-btn" title="Eliminar tarea" @click="removeTask(task)">✕</button>
              </div>

              <div v-if="(tasksByColumn[col.key] || []).length === 0" class="kanban-empty">
                Sin tareas
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Línea de Tiempo del Proyecto -->
      <div v-else>
        <div class="glass-panel" style="padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
          <form @submit.prevent="publishUpdate">
            <div class="form-group">
              <label class="form-label">Nueva actualización</label>
              <textarea
                v-model="newUpdateContent"
                class="form-textarea"
                style="min-height: 80px;"
                placeholder="Describe el hito o avance (ej: Se sustentó el capítulo 1 ante el asesor)..."
              ></textarea>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
              <input type="file" @change="onFileSelected" class="update-file-input" />
              <button type="submit" class="btn-primary" style="width: auto; padding: 0 1.5rem; border-radius: 10px;" :disabled="!newUpdateContent.trim() || isPublishing">
                {{ isPublishing ? 'Publicando...' : 'Publicar Actualización' }}
              </button>
            </div>
          </form>
        </div>

        <div v-if="updates.length > 0" class="timeline-list">
          <div v-for="update in updates" :key="update.id" class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;">
                <strong style="color: var(--text-main); font-size: 0.85rem;">{{ update.author_name || 'Usuario' }}</strong>
                <span style="color: var(--text-muted); font-size: 0.75rem;">{{ formatDateTime(update.created_at) }}</span>
              </div>
              <p style="color: var(--text-sub); font-size: 0.88rem; margin-top: 0.4rem; white-space: pre-line;">{{ update.content }}</p>
              <button
                v-if="update.attachment_filename"
                type="button"
                class="btn-secondary"
                style="margin-top: 0.6rem; font-size: 0.78rem; padding: 0.35rem 0.75rem;"
                @click="downloadAttachment(update)"
              >
                📎 {{ update.attachment_original_name }} ({{ formatFileSize(update.attachment_size) }})
              </button>
            </div>
          </div>
        </div>
        <div v-else class="glass-panel" style="padding: 2rem; text-align: center; color: var(--text-muted);">
          Aún no hay actualizaciones. Publica el primer hito del proyecto arriba.
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

const props = defineProps({ id: { type: String, required: true } });

const TASK_COLUMNS = [
  { key: 'pendiente', label: 'Pendiente', icon: '📋' },
  { key: 'en_progreso', label: 'En Progreso', icon: '⚙️' },
  { key: 'completado', label: 'Completado', icon: '✅' }
];

const activeTab = ref('tasks');
const project = ref(null);
const tasks = ref([]);
const updates = ref([]);
const teamDirectory = ref([]);
const loadError = ref('');
const newTaskTitle = ref('');
const draggedTask = ref(null);
const hoveredColumn = ref(null);
const deadlineInput = ref('');
const collaboratorToAdd = ref('');
const newUpdateContent = ref('');
const newUpdateFile = ref(null);
const isPublishing = ref(false);

const tasksByColumn = computed(() => {
  const grouped = {};
  for (const col of TASK_COLUMNS) grouped[col.key] = [];
  for (const task of tasks.value) {
    (grouped[task.status] || grouped.pendiente).push(task);
  }
  return grouped;
});

const completedCount = computed(() => tasks.value.filter(t => t.status === 'completado').length);
const progressPercentage = computed(() => tasks.value.length === 0 ? 0 : Math.round((completedCount.value / tasks.value.length) * 100));

const availableCollaborators = computed(() => {
  const collaboratorIds = new Set((project.value?.collaborators || []).map(c => c.id));
  return teamDirectory.value.filter(member => !collaboratorIds.has(member.id));
});

const isOverdue = computed(() => {
  if (!project.value?.deadline) return false;
  if (['Entregado', 'Cancelado'].includes(project.value.status)) return false;
  return new Date(project.value.deadline) < new Date(new Date().toDateString());
});

async function fetchProject() {
  const response = await apiFetch(`/api/projects/${props.id}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener el proyecto.');
  project.value = data.project;
  deadlineInput.value = toDateInputValue(data.project.deadline);
}

async function fetchTasks() {
  const response = await apiFetch(`/api/projects/${props.id}/tasks`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener las tareas.');
  tasks.value = data.tasks || [];
}

async function fetchUpdates() {
  const response = await apiFetch(`/api/projects/${props.id}/updates`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener la línea de tiempo.');
  updates.value = data.updates || [];
}

async function fetchTeamDirectory() {
  const response = await apiFetch('/api/team-directory');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener el directorio de equipo.');
  teamDirectory.value = data.users || [];
}

async function loadAll() {
  loadError.value = '';
  try {
    await Promise.all([fetchProject(), fetchTasks(), fetchUpdates(), fetchTeamDirectory()]);
  } catch (err) {
    loadError.value = err.message;
  }
}

function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

async function saveDeadline() {
  try {
    const response = await apiFetch(`/api/projects/${props.id}/deadline`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: deadlineInput.value || null })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar el plazo.');
    project.value = { ...project.value, ...data.project };
  } catch (err) {
    alert('No se pudo guardar el plazo: ' + err.message);
  }
}

async function saveLeader(userId) {
  try {
    const response = await apiFetch(`/api/projects/${props.id}/leader`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId || null })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al asignar el líder.');
    project.value = { ...project.value, ...data.project };
  } catch (err) {
    alert('No se pudo asignar el líder: ' + err.message);
  }
}

async function addCollaborator() {
  if (!collaboratorToAdd.value) return;
  try {
    const response = await apiFetch(`/api/projects/${props.id}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: collaboratorToAdd.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al agregar el colaborador.');
    project.value = { ...project.value, ...data.project };
    collaboratorToAdd.value = '';
  } catch (err) {
    alert('No se pudo agregar el colaborador: ' + err.message);
  }
}

async function removeCollaborator(userId) {
  try {
    const response = await apiFetch(`/api/projects/${props.id}/collaborators/${userId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al quitar el colaborador.');
    project.value = { ...project.value, ...data.project };
  } catch (err) {
    alert('No se pudo quitar el colaborador: ' + err.message);
  }
}

function onFileSelected(event) {
  newUpdateFile.value = event.target.files[0] || null;
}

async function publishUpdate() {
  const content = newUpdateContent.value.trim();
  if (!content) return;
  isPublishing.value = true;
  try {
    const formData = new FormData();
    formData.append('content', content);
    if (newUpdateFile.value) formData.append('attachment', newUpdateFile.value);

    const response = await apiFetch(`/api/projects/${props.id}/updates`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al publicar la actualización.');

    updates.value.unshift(data.update);
    newUpdateContent.value = '';
    newUpdateFile.value = null;
    const fileInput = document.querySelector('.update-file-input');
    if (fileInput) fileInput.value = '';
  } catch (err) {
    alert('No se pudo publicar la actualización: ' + err.message);
  } finally {
    isPublishing.value = false;
  }
}

async function downloadAttachment(update) {
  try {
    const response = await apiFetch(`/api/project-updates/${update.id}/attachment`);
    if (!response.ok) throw new Error('Error al descargar el archivo.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = update.attachment_original_name || 'archivo';
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('No se pudo descargar el adjunto: ' + err.message);
  }
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function addTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;
  try {
    const response = await apiFetch(`/api/projects/${props.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear la tarea.');
    tasks.value.push(data.task);
    newTaskTitle.value = '';
  } catch (err) {
    alert('No se pudo agregar la tarea: ' + err.message);
  }
}

async function removeTask(task) {
  const previousTasks = tasks.value;
  tasks.value = tasks.value.filter(t => t.id !== task.id);
  try {
    const response = await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar la tarea.');
  } catch (err) {
    tasks.value = previousTasks;
    alert('No se pudo eliminar la tarea: ' + err.message);
  }
}

async function toggleComplete(task, checked) {
  await moveTaskToStatus(task, checked ? 'completado' : 'pendiente');
}

function onDragStart(task) {
  draggedTask.value = task;
}

function onColumnDragLeave(colKey) {
  if (hoveredColumn.value === colKey) hoveredColumn.value = null;
}

function onDrop(columnKey) {
  hoveredColumn.value = null;
  const task = draggedTask.value;
  draggedTask.value = null;
  if (!task || task.status === columnKey) return;
  moveTaskToStatus(task, columnKey);
}

async function moveTaskToStatus(task, newStatus) {
  const previousStatus = task.status;
  task.status = newStatus;
  try {
    const response = await apiFetch(`/api/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar la tarea.');
    task.status = data.task.status;
  } catch (err) {
    task.status = previousStatus;
    alert('No se pudo actualizar la tarea: ' + err.message);
  }
}

function statusClass(status) {
  const map = {
    'Creado': 'status-creado',
    'Iniciado': 'status-iniciado',
    'En Desarrollo': 'status-en-desarrollo',
    'Entregado': 'status-entregado',
    'Cancelado': 'status-cancelado'
  };
  return map[status] || 'status-creado';
}

function progressColor(percentage) {
  if (percentage >= 100) return '#10B981';
  if (percentage >= 50) return '#105EFF';
  if (percentage > 0) return '#F59E0B';
  return 'rgba(255, 255, 255, 0.15)';
}

onMounted(() => {
  loadAll();
});
</script>

<style scoped>
.status-pill {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
}

.status-creado { background: rgba(16, 185, 129, 0.15); color: #6EE7B7; border: 1px solid rgba(16, 185, 129, 0.35); }
.status-iniciado { background: rgba(245, 158, 11, 0.15); color: #FCD34D; border: 1px solid rgba(245, 158, 11, 0.35); }
.status-en-desarrollo { background: rgba(16, 94, 255, 0.15); color: #6E9BFF; border: 1px solid rgba(16, 94, 255, 0.35); }
.status-entregado { background: rgba(191, 194, 199, 0.15); color: #D8DADD; border: 1px solid rgba(191, 194, 199, 0.35); }
.status-cancelado { background: rgba(244, 63, 94, 0.15); color: #FDA4AF; border: 1px solid rgba(244, 63, 94, 0.35); }

.tab-bar {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.tab-button {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.7rem 0.25rem;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.tab-button:hover {
  color: var(--text-sub);
}

.tab-button.active {
  color: var(--text-main);
  border-bottom-color: var(--primary);
}

.task-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 1rem;
}

@media (max-width: 760px) {
  .task-board {
    grid-template-columns: 1fr;
  }
}

.task-column {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  min-height: 320px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.task-column.is-drag-over {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
}

.task-column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-color);
}

.kanban-count {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 0.1rem 0.55rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.task-column-body {
  flex: 1;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.task-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  transition: border-color 0.15s ease;
}

.task-card:hover {
  border-color: rgba(255, 255, 255, 0.25);
}

.task-checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.83rem;
  color: var(--text-sub);
  cursor: pointer;
}

.task-checkbox-row input {
  accent-color: var(--primary);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.task-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.35rem;
  border-radius: 6px;
  flex-shrink: 0;
}

.task-delete-btn:hover {
  color: var(--accent-rose);
  background: rgba(244, 63, 94, 0.12);
}

.kanban-empty {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 1rem 0.5rem;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
}

/* Equipo y Plazo */
.team-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 640px) {
  .team-grid {
    grid-template-columns: 1fr;
  }
}

.collaborator-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(16, 94, 255, 0.12);
  border: 1px solid rgba(16, 94, 255, 0.3);
  color: var(--text-sub);
  border-radius: 9999px;
  padding: 0.3rem 0.5rem 0.3rem 0.85rem;
  font-size: 0.8rem;
}

.collaborator-chip button {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem 0.3rem;
  border-radius: 50%;
}

.collaborator-chip button:hover {
  color: var(--accent-rose);
  background: rgba(244, 63, 94, 0.15);
}

/* Línea de Tiempo */
.update-file-input {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 260px;
}

.timeline-list {
  position: relative;
  padding-left: 1.75rem;
}

.timeline-list::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--border-color);
}

.timeline-item {
  position: relative;
  margin-bottom: 1.25rem;
}

.timeline-dot {
  position: absolute;
  left: -1.75rem;
  top: 0.3rem;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 4px rgba(16, 94, 255, 0.18);
}

.timeline-content {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.25rem;
}
</style>
