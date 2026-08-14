<template>
  <main class="container" style="flex: 1; padding-top: 2rem; padding-bottom: 4rem;">
    <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h2 class="section-heading"><span>🚀</span> Proyectos</h2>
        <p class="section-subheading" style="margin-bottom: 0;">
          Se generan automáticamente cuando un lead llega al estado "Ganado" en el
          <router-link to="/admin/leads" style="color: var(--accent-cyan);">Funnel de Ventas</router-link>.
        </p>
      </div>
      <div style="display: flex; gap: 0.6rem;">
        <button class="btn-primary" style="width: auto; padding: 0 1.25rem;" @click="openCreateModal">
          + Nuevo Proyecto
        </button>
        <button class="btn-secondary" @click="fetchProjects" :disabled="isLoading">
          {{ isLoading ? 'Cargando...' : '🔄 Actualizar' }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="info-box" style="border-color: rgba(244, 63, 94, 0.4); margin-bottom: 1.5rem;">
      <h4 style="color: var(--accent-rose);">⚠️ No se pudo cargar los proyectos</h4>
      <p>{{ loadError }}</p>
    </div>

    <!-- Resumen por estado -->
    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
      <div v-for="s in STATUSES" :key="s" class="status-summary-chip">
        <span :class="['status-pill', statusClass(s)]">{{ s }}</span>
        <span style="color: var(--text-muted);">{{ countByStatus[s] || 0 }}</span>
      </div>
    </div>

    <div class="glass-panel" style="padding: 1.5rem; overflow-x: auto;">
      <table v-if="projects.length > 0" class="projects-table">
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Cliente</th>
            <th>Nivel / Carrera</th>
            <th>Estado</th>
            <th>Avance</th>
            <th>Fecha Límite</th>
            <th>Creado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="project in projects" :key="project.id">
            <td class="topic-cell">
              <router-link :to="`/admin/projects/${project.id}`" style="color: var(--text-main); text-decoration: none; font-weight: 600;">
                {{ project.topic }}
              </router-link>
            </td>
            <td>
              <div>{{ project.client_email }}</div>
              <div style="color: var(--text-muted); font-size: 0.78rem;">📱 {{ project.client_phone }}</div>
            </td>
            <td style="white-space: nowrap;">
              <div>{{ project.academic_level }}</div>
              <div style="color: var(--text-muted); font-size: 0.78rem;">{{ project.field_of_study }}</div>
            </td>
            <td>
              <select
                :value="project.status"
                class="form-select status-select"
                @change="updateStatus(project, $event.target.value)"
              >
                <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td style="min-width: 140px;">
              <div class="metric-bar-bg" style="margin-bottom: 0.25rem;">
                <div class="metric-bar-fill" :style="{ width: (project.progress_percentage || 0) + '%', background: progressColor(project.progress_percentage) }"></div>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted);">
                {{ project.progress_percentage || 0 }}% ({{ project.completed_tasks || 0 }}/{{ project.total_tasks || 0 }})
              </span>
            </td>
            <td style="white-space: nowrap; font-size: 0.8rem;" :style="{ color: isOverdue(project) ? 'var(--accent-rose)' : 'var(--text-muted)' }">
              {{ project.deadline ? formatDate(project.deadline) : '—' }}
              <span v-if="isOverdue(project)">⚠️</span>
            </td>
            <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.8rem;">{{ formatDate(project.created_at) }}</td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!isLoading" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
        Todavía no hay proyectos. Se crean automáticamente cuando un lead llega a la columna "Ganado" del funnel.
      </div>
    </div>

    <!-- Modal: Crear Proyecto Libremente -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-content" style="max-width: 520px;">
        <div class="modal-header">
          <h3 style="font-family: var(--font-heading); font-size: 1.05rem; color: var(--text-main); margin: 0;">
            🚀 Nuevo Proyecto
          </h3>
          <button class="btn-secondary" style="padding: 0.3rem 0.75rem;" @click="showCreateModal = false">✕ Cerrar</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.25rem;">
            Crea un proyecto directamente, sin que provenga de un lead ganado en el funnel de ventas.
          </p>
          <form @submit.prevent="createProject">
            <div class="form-group">
              <label class="form-label">Proyecto / Tema</label>
              <input v-model="newProject.topic" type="text" class="form-input" placeholder="Ej: Sistema de gestión documental para MYPEs" required />
            </div>
            <div class="form-group">
              <label class="form-label">Correo del cliente</label>
              <input v-model="newProject.clientEmail" type="email" class="form-input" required />
            </div>
            <div class="form-group">
              <label class="form-label">Celular del cliente</label>
              <input v-model="newProject.clientPhone" type="text" class="form-input" required />
            </div>
            <div class="form-group">
              <label class="form-label">Nivel académico</label>
              <select v-model="newProject.academicLevel" class="form-select" required>
                <option value="Pregrado (Bachiller/Título)">Pregrado (Bachiller / Título)</option>
                <option value="Posgrado (Maestría)">Posgrado (Maestría)</option>
                <option value="Posgrado (Doctorado)">Posgrado (Doctorado)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Carrera / Campo de estudio</label>
              <select v-model="newProject.fieldOfStudy" class="form-select" required>
                <option value="Ingeniería de Sistemas y Computación">Ingeniería de Sistemas y Computación</option>
                <option value="Ingeniería Agrónoma y Agroindustrial">Ingeniería Agrónoma y Agroindustrial</option>
                <option value="Ciencias de la Salud y Medicina">Ciencias de la Salud y Medicina</option>
                <option value="Administración, Negocios y Finanzas">Administración, Negocios y Finanzas</option>
                <option value="Derecho y Ciencias Políticas">Derecho y Ciencias Políticas</option>
                <option value="Educación y Psicología">Educación y Psicología</option>
                <option value="Ingeniería de Minas y Geología">Ingeniería de Minas y Geología</option>
                <option value="Ingeniería Ambiental y Ecología">Ingeniería Ambiental y Ecología</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha límite (opcional)</label>
              <input v-model="newProject.deadline" type="date" class="form-input" />
            </div>

            <div v-if="createError" style="color: var(--accent-rose); font-size: 0.82rem; margin-bottom: 1rem;">{{ createError }}</div>

            <button type="submit" class="btn-primary" :disabled="isCreating">
              {{ isCreating ? 'Creando...' : 'Crear Proyecto' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

const STATUSES = ['Creado', 'Iniciado', 'En Desarrollo', 'Entregado', 'Cancelado'];

const projects = ref([]);
const isLoading = ref(false);
const loadError = ref('');

const showCreateModal = ref(false);
const isCreating = ref(false);
const createError = ref('');
const newProject = reactive({
  topic: '',
  clientEmail: '',
  clientPhone: '',
  academicLevel: 'Pregrado (Bachiller/Título)',
  fieldOfStudy: 'Ingeniería de Sistemas y Computación',
  deadline: ''
});

const countByStatus = computed(() => {
  const counts = {};
  for (const project of projects.value) {
    counts[project.status] = (counts[project.status] || 0) + 1;
  }
  return counts;
});

async function fetchProjects() {
  isLoading.value = true;
  loadError.value = '';
  try {
    const response = await apiFetch('/api/projects');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener los proyectos.');
    projects.value = data.projects || [];
  } catch (err) {
    loadError.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function updateStatus(project, newStatus) {
  const previousStatus = project.status;
  project.status = newStatus;
  try {
    const response = await apiFetch(`/api/projects/${project.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar el proyecto.');
    project.status = data.project.status;
  } catch (err) {
    project.status = previousStatus;
    alert('No se pudo actualizar el proyecto: ' + err.message);
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

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(project) {
  if (!project.deadline || ['Entregado', 'Cancelado'].includes(project.status)) return false;
  return new Date(project.deadline) < new Date(new Date().toDateString());
}

function openCreateModal() {
  createError.value = '';
  newProject.topic = '';
  newProject.clientEmail = '';
  newProject.clientPhone = '';
  newProject.academicLevel = 'Pregrado (Bachiller/Título)';
  newProject.fieldOfStudy = 'Ingeniería de Sistemas y Computación';
  newProject.deadline = '';
  showCreateModal.value = true;
}

async function createProject() {
  isCreating.value = true;
  createError.value = '';
  try {
    const response = await apiFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newProject, deadline: newProject.deadline || null })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear el proyecto.');
    projects.value.unshift(data.project);
    showCreateModal.value = false;
  } catch (err) {
    createError.value = err.message;
  } finally {
    isCreating.value = false;
  }
}

onMounted(() => {
  fetchProjects();
});
</script>

<style scoped>
.status-summary-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.8rem;
}

.projects-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.projects-table th {
  text-align: left;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.projects-table td {
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-sub);
  vertical-align: top;
}

.topic-cell {
  max-width: 320px;
  color: var(--text-main);
  font-weight: 500;
}

.status-select {
  width: auto;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
}

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
</style>
