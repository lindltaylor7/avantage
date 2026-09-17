<template>
  <div class="portal-page">
    <header class="portal-page-header">
      <span class="portal-page-eyebrow">Hola{{ clientAuthState.client?.name ? `, ${firstName}` : '' }}</span>
      <h1 class="portal-page-title">Tus proyectos</h1>
    </header>

    <div v-if="isLoading" class="portal-state-msg">Cargando tus proyectos…</div>

    <div v-else-if="errorMessage" class="portal-state-msg is-error">{{ errorMessage }}</div>

    <div v-else-if="projects.length === 0" class="portal-empty">
      <span class="portal-empty-icon">🌱</span>
      <h2 class="portal-empty-title">Todavía no hay ningún proyecto aquí</h2>
      <p class="portal-empty-text">
        En cuanto tu vendedor confirme el inicio de tu proyecto, va a aparecer en esta pantalla.
      </p>
    </div>

    <div v-else class="portal-project-list">
      <router-link
        v-for="project in projects"
        :key="project.id"
        :to="`/portal/proyectos/${project.id}`"
        class="portal-project-card"
      >
        <div class="portal-project-card-top">
          <span class="portal-status-chip" :class="statusChipClass(project)">{{ statusLabel(project) }}</span>
          <span v-if="project.deadline" class="portal-project-deadline">📅 {{ formatDate(project.deadline) }}</span>
        </div>

        <h2 class="portal-project-topic">{{ project.topic }}</h2>

        <p v-if="project.is_locked" class="portal-project-locked-note">
          ⏳ A la espera de que verifiquemos tu pago inicial (S/ {{ Number(project.initial_payment?.monto || 0).toFixed(2) }})
        </p>

        <ProjectProgressStem :progress="project.progress_percentage" />
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { clientAuthState } from '../../clientAuth.js';
import { clientApiFetch } from '../../clientApiClient.js';
import ProjectProgressStem from '../../components/ProjectProgressStem.vue';

const projects = ref([]);
const isLoading = ref(true);
const errorMessage = ref('');

const firstName = computed(() => (clientAuthState.client?.name || '').trim().split(/\s+/)[0] || '');

function statusLabel(project) {
  if (project.is_locked) return 'Por activar';
  if (project.status === 'Activo') return 'En marcha';
  if (project.status === 'Creado') return 'Creado';
  return project.status;
}

function statusChipClass(project) {
  if (project.is_locked) return 'is-pending';
  if (project.status === 'Activo') return 'is-active';
  return 'is-neutral';
}

function formatDate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

async function loadProjects() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await clientApiFetch('/api/portal/projects');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar tus proyectos.');
    projects.value = data.projects || [];
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadProjects);
</script>

<style scoped>
.portal-page-header {
  margin-bottom: 1.5rem;
}

.portal-page-eyebrow {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 0.35rem;
}

.portal-page-title {
  font-family: var(--font-heading);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
}

.portal-state-msg {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.portal-state-msg.is-error {
  color: var(--accent-rose);
}

.portal-empty {
  text-align: center;
  padding: 3rem 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
}

.portal-empty-icon {
  font-size: 2.2rem;
  display: block;
  margin-bottom: 0.75rem;
}

.portal-empty-title {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.5rem;
}

.portal-empty-text {
  font-size: 0.88rem;
  color: var(--text-muted);
  max-width: 380px;
  margin: 0 auto;
  line-height: 1.55;
}

.portal-project-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.portal-project-card {
  display: block;
  padding: 1.15rem 1.2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
}

.portal-project-card:hover,
.portal-project-card:active {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.portal-project-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.portal-status-chip {
  display: inline-block;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.portal-status-chip.is-pending {
  background: rgba(222, 117, 75, 0.14);
  color: var(--accent-amber);
}

.portal-status-chip.is-active {
  background: rgba(111, 129, 37, 0.14);
  color: var(--primary);
}

.portal-status-chip.is-neutral {
  background: var(--surface-3);
  color: var(--text-sub);
}

.portal-project-deadline {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.portal-project-topic {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.35;
  margin-bottom: 0.75rem;
}

.portal-project-locked-note {
  font-size: 0.82rem;
  color: var(--accent-amber);
  background: rgba(222, 117, 75, 0.08);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.65rem;
  margin-bottom: 0.85rem;
  line-height: 1.4;
}
</style>
