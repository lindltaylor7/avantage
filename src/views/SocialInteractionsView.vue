<template>
  <main class="container-fluid social-page-wrapper">
    <header class="social-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">💬</span> Interacciones de Facebook
        </h2>
        <p class="section-subheading">
          Comentarios, reacciones, publicaciones y compartidos recibidos en tiempo real
          desde tus páginas conectadas (campo <code>feed</code> del webhook de Meta).
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-secondary" @click="fetchAll" :disabled="isLoading" title="Actualizar ahora">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span>
          {{ isLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box alert-box">⚠️ {{ errorMessage }}</p>

    <!-- Stats -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper blue">📨</div>
        <div class="stat-info">
          <span class="stat-label">Total interacciones</span>
          <span class="stat-value">{{ stats.total || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper green">💬</div>
        <div class="stat-info">
          <span class="stat-label">Comentarios</span>
          <span class="stat-value">{{ stats.byType?.comment || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper amber">👍</div>
        <div class="stat-info">
          <span class="stat-label">Reacciones</span>
          <span class="stat-value">{{ (stats.byType?.reaction || 0) + (stats.byType?.like || 0) }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper purple">🔁</div>
        <div class="stat-info">
          <span class="stat-label">Compartidos</span>
          <span class="stat-value">{{ stats.byType?.share || 0 }}</span>
        </div>
      </div>
    </section>

    <!-- Seguidores -->
    <section class="followers-card">
      <div class="followers-info">
        <span class="followers-icon">👥</span>
        <div>
          <span class="followers-label">Seguidores de la página{{ followersLatest?.page_name ? ` (${followersLatest.page_name})` : '' }}</span>
          <span class="followers-value">
            {{ followersLatest?.followers_count ?? followersLatest?.fan_count ?? '—' }}
          </span>
          <span class="followers-hint">
            {{ followersLatest ? `Última medición: ${formatTime(followersLatest.captured_at)}` : 'Aún no hay mediciones registradas.' }}
            No es en tiempo real: Meta no notifica follows/unfollows por webhook, se sondea periódicamente.
          </span>
        </div>
      </div>
      <button class="btn-action-secondary" @click="pollFollowersNow" :disabled="isPolling">
        <span :class="['btn-icon', { 'spin-animation': isPolling }]">🔄</span>
        {{ isPolling ? 'Sondeando...' : 'Actualizar ahora' }}
      </button>
    </section>

    <!-- Filtro por tipo -->
    <div class="filter-pills">
      <button
        v-for="pill in TYPE_FILTERS"
        :key="pill.id"
        class="filter-pill"
        :class="{ active: selectedType === pill.id }"
        @click="selectedType = pill.id; fetchInteractions()"
      >
        {{ pill.label }}
      </button>
    </div>

    <!-- Lista de interacciones -->
    <section v-if="!isLoading && interactions.length === 0" class="empty-state">
      <div class="empty-state-visual">
        <img src="/images/empty_chat_state.jpg" alt="Facebook Feed" class="empty-state-photo" />
      </div>
      <h4 class="empty-title">Aún no se han recibido interacciones de Facebook</h4>
      <p class="empty-subtitle">Asegúrate de suscribir el campo "feed" en el webhook de Meta y comenta o reacciona a un post de prueba en tu página.</p>
    </section>

    <section v-else class="interactions-list">
      <article v-for="item in interactions" :key="item.id" class="interaction-card">
        <img v-if="item.post_picture_url" :src="item.post_picture_url" alt="" class="interaction-thumb" />
        <div v-else class="interaction-icon">{{ iconFor(item.item_type) }}</div>
        <div class="interaction-body">
          <div class="interaction-top">
            <span class="interaction-type">{{ labelFor(item.item_type) }}</span>
            <span class="interaction-time">{{ formatTime(item.received_at) }}</span>
          </div>
          <p v-if="item.sender_name" class="interaction-sender">{{ item.sender_name }}</p>
          <p v-if="item.message" class="interaction-message">"{{ item.message }}"</p>
          <p v-if="item.reaction_type" class="interaction-reaction">Reacción: {{ item.reaction_type }}</p>
          <p v-if="item.post_message" class="interaction-post-preview">📝 {{ truncate(item.post_message, 140) }}</p>
          <p class="interaction-refs">
            <span v-if="item.post_id">Post: {{ item.post_id }}</span>
            <span v-if="item.page_id"> · Página: {{ item.page_id }}</span>
            <a v-if="item.post_permalink_url" :href="item.post_permalink_url" target="_blank" rel="noopener noreferrer" class="interaction-link">Ver en Facebook ↗</a>
          </p>
        </div>
      </article>
    </section>

    <!-- Mensajes de Messenger -->
    <h3 class="subsection-title">📩 Mensajes de Messenger ({{ messengerStats.total || 0 }})</h3>
    <section v-if="!isLoading && messengerMessages.length === 0" class="empty-state">
      <div class="empty-state-visual">
        <img src="/images/empty_inbox.jpg" alt="Messenger Inbox" class="empty-state-photo" />
      </div>
      <h4 class="empty-title">Aún no se ha recibido ningún mensaje directo de Messenger</h4>
      <p class="empty-subtitle">Asegúrate de suscribir el campo "messages" en el webhook de Meta y envía un mensaje a la página para verificar la recepción.</p>
    </section>
    <section v-else class="messenger-list">
      <article v-for="msg in messengerMessages" :key="msg.id" class="messenger-card">
        <span class="interaction-icon">💬</span>
        <div class="interaction-body">
          <div class="interaction-top">
            <span class="interaction-sender">{{ msg.sender_name || msg.sender_id }}</span>
            <span class="interaction-time">{{ formatTime(msg.received_at) }}</span>
          </div>
          <p v-if="msg.text" class="interaction-message">"{{ msg.text }}"</p>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const TYPE_FILTERS = [
  { id: null, label: 'Todos' },
  { id: 'status', label: 'Publicaciones' },
  { id: 'comment', label: 'Comentarios' },
  { id: 'reaction', label: 'Reacciones' },
  { id: 'share', label: 'Compartidos' }
];

const interactions = ref([]);
const stats = ref({ total: 0, byType: {} });
const messengerMessages = ref([]);
const messengerStats = ref({ total: 0, contacts: 0 });
const followersLatest = ref(null);
const isLoading = ref(false);
const isPolling = ref(false);
const errorMessage = ref('');
const selectedType = ref(null);

async function fetchInteractions() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (selectedType.value) params.set('itemType', selectedType.value);
    const response = await apiFetch(`/api/social-interactions?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener las interacciones.');
    interactions.value = data.interactions || [];
    stats.value = data.stats || { total: 0, byType: {} };
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
}

async function fetchFollowers() {
  try {
    const response = await apiFetch('/api/social-followers');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener los seguidores.');
    followersLatest.value = data.latest || null;
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchMessengerMessages() {
  try {
    const response = await apiFetch('/api/page-messages?limit=50');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener los mensajes de Messenger.');
    messengerMessages.value = data.messages || [];
    messengerStats.value = data.stats || { total: 0, contacts: 0 };
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchAll() {
  await Promise.all([fetchInteractions(), fetchFollowers(), fetchMessengerMessages()]);
}

async function pollFollowersNow() {
  isPolling.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/social-followers/poll', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || 'Error al sondear los seguidores.');
    followersLatest.value = data.snapshot;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isPolling.value = false;
  }
}

function iconFor(type) {
  const icons = { status: '📝', comment: '💬', reaction: '👍', like: '👍', share: '🔁', photo: '🖼️', video: '🎬' };
  return icons[type] || '📌';
}

function labelFor(type) {
  const labels = {
    status: 'Nueva publicación', comment: 'Comentario', reaction: 'Reacción',
    like: 'Reacción', share: 'Compartido', photo: 'Foto', video: 'Video'
  };
  return labels[type] || type;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

onMounted(fetchAll);
</script>

<style scoped>
.social-page-wrapper {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.social-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header-titles {
  max-width: 640px;
}

.section-subheading {
  color: var(--text-sub);
  font-size: 0.9rem;
  line-height: 1.5;
}

.section-subheading code {
  background: var(--surface-2);
  padding: 0.1rem 0.35rem;
  border-radius: 5px;
  font-size: 0.85em;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
}

.btn-action-secondary {
  background: var(--surface-2);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.6rem 1.1rem;
  font-size: 0.86rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: all 0.2s ease;
}

.btn-action-secondary:hover:not(:disabled) {
  background: var(--surface-3);
}

.btn-action-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin-animation {
  display: inline-block;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.alert-box {
  border-color: rgba(239, 68, 68, 0.4);
  color: #E0717C;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.stat-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
}

.stat-icon-wrapper.blue { background: rgba(76, 134, 255, 0.15); }
.stat-icon-wrapper.green { background: rgba(34, 197, 94, 0.15); }
.stat-icon-wrapper.amber { background: rgba(201, 146, 46, 0.15); }
.stat-icon-wrapper.purple { background: rgba(111, 129, 37, 0.15); }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.78rem;
  color: var(--text-sub);
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  font-family: var(--font-heading);
  color: var(--text-main);
}

.followers-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.followers-info {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.followers-icon {
  font-size: 1.8rem;
}

.followers-info > div {
  display: flex;
  flex-direction: column;
}

.followers-label {
  font-size: 0.8rem;
  color: var(--text-sub);
}

.followers-value {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-heading);
  color: var(--text-main);
}

.followers-hint {
  font-size: 0.72rem;
  color: var(--text-sub);
  opacity: 0.8;
  max-width: 480px;
}

.filter-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-pill {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-sub);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-pill.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #ffffff;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-sub);
}

.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.75rem;
}

.empty-hint {
  font-size: 0.85rem;
  opacity: 0.75;
  margin-top: 0.25rem;
}

.interactions-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.interaction-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.9rem 1.1rem;
  display: flex;
  gap: 0.85rem;
}

.subsection-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  color: var(--text-main);
  margin-top: 0.5rem;
}

.messenger-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.messenger-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.9rem 1.1rem;
  display: flex;
  gap: 0.85rem;
}

.interaction-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.interaction-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}

.interaction-body {
  flex: 1;
  min-width: 0;
}

.interaction-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.interaction-type {
  font-weight: 600;
  color: var(--text-main);
  font-size: 0.88rem;
}

.interaction-time {
  font-size: 0.78rem;
  color: var(--text-sub);
}

.interaction-sender {
  font-size: 0.82rem;
  color: var(--accent-cyan);
  margin-top: 0.2rem;
}

.interaction-message {
  font-size: 0.85rem;
  color: var(--text-sub);
  margin-top: 0.2rem;
  font-style: italic;
  overflow-wrap: break-word;
}

.interaction-reaction {
  font-size: 0.8rem;
  color: var(--text-sub);
  margin-top: 0.2rem;
}

.interaction-post-preview {
  font-size: 0.78rem;
  color: var(--text-sub);
  opacity: 0.85;
  margin-top: 0.3rem;
  overflow-wrap: break-word;
}

.interaction-refs {
  font-size: 0.72rem;
  color: var(--text-sub);
  opacity: 0.7;
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.interaction-link {
  color: var(--accent-cyan);
  text-decoration: none;
  opacity: 1;
  font-weight: 600;
}

.interaction-link:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .social-page-wrapper {
    padding: 1rem;
  }
}
</style>
