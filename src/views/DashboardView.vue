<template>
  <div class="dashboard-container">
    <!-- Welcome Banner Card -->
    <div class="welcome-banner">
      <div class="welcome-content">
        <h1 class="welcome-title">
          {{ welcomeName }}, te damos la bienvenida 🥳
        </h1>
        <p class="welcome-text">
          Tienes <strong>{{ pendingCommunicationsCount }}</strong> comunicaciones pendientes para hoy, te recomendamos revisarlas.
        </p>
      </div>

      <div class="welcome-illustration-wrapper">
        <img 
          src="/welcome_illustration.png" 
          alt="Bienvenida Avantage Group" 
          class="welcome-img"
          @error="handleImgError"
        />
        <!-- SVG Vector Fallback if image fails loading -->
        <svg v-if="imgFailed" class="fallback-svg" viewBox="0 0 240 180" fill="none">
          <rect x="20" y="120" width="200" height="12" rx="4" fill="#2d3748"/>
          <rect x="50" y="60" width="140" height="60" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
          <circle cx="120" cy="40" r="16" fill="#3b82f6"/>
          <path d="M100 80h40v20h-40z" fill="#60a5fa"/>
          <circle cx="160" cy="110" r="8" fill="#10b981"/>
        </svg>
      </div>
    </div>

    <!-- Communications Section -->
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">Comunicaciones Pendientes</h2>
        <span class="count-pill">{{ pendingCommunicationsCount }}</span>
      </div>

      <div class="section-body">
        <div v-if="pendingCommunicationsCount === 0" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <p class="empty-title">No hay comunicaciones pendientes por atender</p>
          <p class="empty-subtitle">Todo está al día en tu bandeja. Nuevos leads o solicitudes aparecerán aquí.</p>
        </div>
        <div v-else class="communications-list">
          <div v-for="comm in pendingCommunications" :key="comm.id" class="comm-item">
            <div class="comm-avatar">💬</div>
            <div class="comm-info">
              <div class="comm-name">{{ comm.topic }}</div>
              <div class="comm-meta">{{ comm.lead_name }} — {{ comm.email }}</div>
            </div>
            <router-link to="/admin/leads" class="btn-sm-action">Atender</router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Access Modules & Tools Grid -->
    <div class="modules-grid-header">
      <h3 class="grid-title">Módulos Habilitados</h3>
    </div>

    <div class="modules-grid">
      <router-link
        v-for="tool in availableTools"
        :key="tool.key"
        :to="tool.to"
        class="module-card"
      >
        <div class="module-icon-bg">{{ tool.icon }}</div>
        <div class="module-content">
          <h4 class="module-label">{{ tool.label }}</h4>
          <p class="module-desc">{{ tool.description }}</p>
        </div>
        <div class="module-arrow">→</div>
      </router-link>

      <div v-if="availableTools.length === 0" class="empty-tools-card">
        Tu rol no tiene herramientas asignadas todavía. Solicita acceso a un administrador.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { authState, hasPermission } from '../auth.js';

const imgFailed = ref(false);
const pendingCommunications = ref([]);

const welcomeName = computed(() => {
  if (authState.user?.name) {
    return authState.user.name.split(' ')[0];
  }
  return 'Avantage';
});

const pendingCommunicationsCount = computed(() => pendingCommunications.value.length);

const TOOLS = [
  { key: 'leads.view', label: 'Funnel de Leads', description: 'Gestión comercial de candidatos y clientes en tablero Kanban', icon: '📇', to: '/admin/leads' },
  { key: 'projects.view', label: 'Proyectos & Avances', description: 'Gestión de proyectos, entregables, cronogramas y tareas', icon: '🚀', to: '/admin/projects' },
  { key: 'roles.manage', label: 'Roles y Permisos', description: 'Administración de usuarios, roles de acceso y herramientas', icon: '🔐', to: '/admin/roles' }
];

const availableTools = computed(() => TOOLS.filter(tool => hasPermission(tool.key)));

function handleImgError() {
  imgFailed.value = true;
}

async function fetchDashboardStats() {
  try {
    if (authState.token) {
      const res = await fetch('/api/leads', {
        headers: { 'Authorization': `Bearer ${authState.token}` }
      });
      if (res.ok) {
        const leads = await res.json();
        // Pending leads in initial status (nuevo or contactado)
        pendingCommunications.value = leads.filter(l => l.status === 'nuevo');
      }
    }
  } catch (err) {
    console.warn('Dashboard stats fetch:', err);
  }
}

onMounted(() => {
  fetchDashboardStats();
});
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Welcome Banner matching exact image layout */
.welcome-banner {
  background-color: #181921;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 2rem 2.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.welcome-content {
  max-width: 60%;
  z-index: 2;
}

.welcome-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 0.6rem;
  line-height: 1.3;
}

.welcome-text {
  font-size: 0.925rem;
  color: #9ca3af;
  line-height: 1.5;
}

.welcome-text strong {
  color: #ffffff;
  font-weight: 700;
}

.welcome-illustration-wrapper {
  width: 220px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.welcome-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.4));
}

.fallback-svg {
  width: 100%;
  height: 100%;
}

/* Section Cards matching reference image */
.section-card {
  background-color: #171821;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
}

.count-pill {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
}

.section-body {
  min-height: 100px;
}

.empty-state {
  padding: 2.5rem 1.5rem;
  text-align: center;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
}

.empty-icon {
  width: 42px;
  height: 42px;
  stroke: #4b5563;
  margin-bottom: 0.75rem;
}

.empty-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #d1d5db;
  margin-bottom: 0.25rem;
}

.empty-subtitle {
  font-size: 0.825rem;
  color: #6b7280;
}

.communications-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comm-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0.85rem 1.1rem;
  border-radius: 10px;
}

.comm-avatar {
  font-size: 1.5rem;
}

.comm-info {
  flex: 1;
}

.comm-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #ffffff;
}

.comm-meta {
  font-size: 0.78rem;
  color: #9ca3af;
}

.btn-sm-action {
  background: #1d6bf3;
  color: #ffffff;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 600;
}

/* Modules Grid */
.modules-grid-header {
  margin-top: 0.5rem;
}

.grid-title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.module-card {
  background-color: #171821;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 1.25rem;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.25s ease;
  position: relative;
}

.module-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 10px 25px rgba(29, 107, 243, 0.15);
  background-color: #1c1d28;
}

.module-icon-bg {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.module-content {
  flex: 1;
}

.module-label {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 0.25rem;
}

.module-desc {
  font-size: 0.78rem;
  color: #9ca3af;
  line-height: 1.35;
}

.module-arrow {
  color: #4b5563;
  font-size: 1.2rem;
  transition: transform 0.2s ease, color 0.2s ease;
}

.module-card:hover .module-arrow {
  color: #3b82f6;
  transform: translateX(4px);
}

.empty-tools-card {
  grid-column: 1 / -1;
  background-color: #171821;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  padding: 2rem;
  border-radius: 14px;
  text-align: center;
  color: #9ca3af;
}

@media (max-width: 768px) {
  .welcome-banner {
    flex-direction: column;
    gap: 1.5rem;
    text-align: center;
  }

  .welcome-content {
    max-width: 100%;
  }

  .welcome-illustration-wrapper {
    width: 180px;
    height: 120px;
  }
}
</style>
