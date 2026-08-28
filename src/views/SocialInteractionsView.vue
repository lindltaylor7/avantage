<template>
  <main class="container-fluid social-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Meta</span>
        <h2 class="section-heading"><span class="heading-icon">💬</span> Interacciones de Facebook</h2>
        <p class="section-subheading social-subheading">
          Comentarios, reacciones y compartidos recibidos en tus páginas conectadas
          (campo <code>feed</code> del webhook de Meta), con la miniatura de cada publicación.
        </p>
      </div>
      <div class="page-header-actions">
        <button type="button" class="btn-secondary social-refresh" @click="fetchAll" :disabled="isLoading">
          <span :class="{ 'spin-animation': isLoading }">🔄</span>
          {{ isLoading ? 'Cargando…' : 'Actualizar' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box social-alert">⚠️ {{ errorMessage }}</p>

    <!-- KPIs -->
    <section class="kpi-row">
      <div class="kpi-tile">
        <span class="kpi-label">Total interacciones</span>
        <span class="kpi-value">{{ stats.total || 0 }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Comentarios</span>
        <span class="kpi-value">{{ stats.byType?.comment || 0 }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Reacciones</span>
        <span class="kpi-value">{{ (stats.byType?.reaction || 0) + (stats.byType?.like || 0) }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Compartidos</span>
        <span class="kpi-value">{{ stats.byType?.share || 0 }}</span>
      </div>
    </section>

    <!-- Seguidores -->
    <section class="glass-panel followers-card">
      <div class="followers-info">
        <span class="followers-icon">👥</span>
        <div>
          <span class="followers-label">
            Seguidores de la página{{ followersLatest?.page_name ? ` · ${followersLatest.page_name}` : '' }}
          </span>
          <span class="followers-value">
            {{ followersLatest?.followers_count ?? followersLatest?.fan_count ?? '—' }}
          </span>
          <span class="followers-hint">
            {{ followersLatest ? `Última medición: ${formatTime(followersLatest.captured_at)}` : 'Aún no hay mediciones.' }}
            Se sondea periódicamente; Meta no notifica follows por webhook.
          </span>
        </div>
      </div>
      <button type="button" class="btn-secondary social-refresh" @click="pollFollowersNow" :disabled="isPolling">
        <span :class="{ 'spin-animation': isPolling }">🔄</span>
        {{ isPolling ? 'Sondeando…' : 'Actualizar ahora' }}
      </button>
    </section>

    <!-- Filtro -->
    <div class="tabs social-tabs">
      <button
        v-for="pill in TYPE_FILTERS"
        :key="pill.label"
        type="button"
        class="tab-item"
        :class="{ 'is-active': selectedType === pill.id }"
        @click="selectedType = pill.id; fetchInteractions()"
      >{{ pill.label }}</button>
    </div>

    <!-- Grid de tarjetas -->
    <div v-if="isLoading" class="empty-state"><p>Cargando interacciones…</p></div>
    <div v-else-if="interactions.length === 0" class="empty-state">
      <div class="empty-state-visual">
        <img src="/images/empty_chat_state.jpg" alt="" class="empty-state-photo" />
      </div>
      <p class="empty-state-title">Aún no llegan interacciones de Facebook</p>
      <p class="empty-state-text">
        Suscribe el campo "feed" en el webhook de Meta y comenta o reacciona a una publicación de prueba.
      </p>
    </div>

    <section v-else class="int-grid">
      <article v-for="item in interactions" :key="item.id" class="int-card" :class="{ 'is-removed': item.removed_at }">
        <div class="int-card-media" :class="`media-${tagKind(item.item_type)}`">
          <img
            v-if="item.post_id && imageUrls[item.post_id]"
            :src="imageUrls[item.post_id]"
            alt=""
            class="int-card-img"
            loading="lazy"
          />
          <span v-else class="int-card-media-icon">{{ iconFor(item.item_type) }}</span>
          <span
            class="int-tag"
            :class="item.removed_at ? 'int-tag-removed' : `int-tag-${tagKind(item.item_type)}`"
          >{{ item.removed_at ? `${labelFor(item.item_type)} · eliminado` : labelFor(item.item_type) }}</span>
        </div>

        <div class="int-card-body">
          <div class="int-card-head">
            <span class="int-card-sender">{{ item.sender_name || 'Alguien' }}</span>
            <span class="int-card-time">{{ formatShort(item.received_at) }}</span>
          </div>

          <p v-if="item.message" class="int-card-message" :class="{ 'is-struck': item.removed_at }">{{ item.message }}</p>
          <p v-else-if="item.reaction_type" class="int-card-message int-card-message-muted">
            Reaccionó con {{ item.reaction_type }}
          </p>
          <p v-else class="int-card-message int-card-message-muted">{{ labelFor(item.item_type) }}</p>

          <p v-if="item.removed_at" class="int-card-removed-note">
            🗑️ Eliminado u oculto en Facebook · {{ formatShort(item.removed_at) }}
          </p>

          <p v-if="item.post_message" class="int-card-post">
            <span class="int-card-post-icon">📄</span>{{ truncate(item.post_message, 100) }}
          </p>

          <a
            v-if="item.post_permalink_url"
            :href="item.post_permalink_url"
            target="_blank"
            rel="noopener noreferrer"
            class="int-card-link"
          >Ver en Facebook ↗</a>
        </div>
      </article>
    </section>

    <!-- Messenger -->
    <section class="messenger-section">
      <h3 class="messenger-title">📩 Mensajes de Messenger <span class="messenger-count">{{ messengerStats.total || 0 }}</span></h3>
      <div v-if="messengerMessages.length === 0" class="empty-state">
        <p class="empty-state-title">Sin mensajes directos de Messenger</p>
        <p class="empty-state-text">Suscribe el campo "messages" en el webhook y escribe a la página.</p>
      </div>
      <div v-else class="messenger-list">
        <article v-for="msg in messengerMessages" :key="msg.id" class="messenger-item">
          <span class="messenger-avatar">{{ (msg.sender_name || '?').slice(0, 1).toUpperCase() }}</span>
          <div class="messenger-body">
            <div class="messenger-item-head">
              <span class="messenger-sender">{{ msg.sender_name || msg.sender_id }}</span>
              <span class="messenger-time">{{ formatShort(msg.received_at) }}</span>
            </div>
            <p v-if="msg.text" class="messenger-text">{{ msg.text }}</p>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../apiClient.js';
import { loadApiImage } from '../apiImage.js';

const TYPE_FILTERS = [
  { id: null, label: 'Todas' },
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
const imageUrls = reactive({});

function releaseImages(keep = new Set()) {
  for (const key of Object.keys(imageUrls)) {
    if (keep.has(key)) continue;
    URL.revokeObjectURL(imageUrls[key]);
    delete imageUrls[key];
  }
}

async function hydrateImages() {
  const postIds = [...new Set(interactions.value.map((i) => i.post_id).filter(Boolean))];
  releaseImages(new Set(postIds));
  for (const postId of postIds) {
    if (imageUrls[postId]) continue;
    const url = await loadApiImage(`/api/social-interactions/post-image/${encodeURIComponent(postId)}`);
    if (url) imageUrls[postId] = url;
  }
}

async function fetchInteractions() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const params = new URLSearchParams({ limit: '60' });
    if (selectedType.value) params.set('itemType', selectedType.value);
    const response = await apiFetch(`/api/social-interactions?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron obtener las interacciones.');
    interactions.value = data.interactions || [];
    stats.value = data.stats || { total: 0, byType: {} };
    hydrateImages();
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
    if (response.ok) followersLatest.value = data.latest || null;
  } catch { /* silencioso */ }
}

async function fetchMessengerMessages() {
  try {
    const response = await apiFetch('/api/page-messages?limit=50');
    const data = await response.json();
    if (response.ok) {
      messengerMessages.value = data.messages || [];
      messengerStats.value = data.stats || { total: 0, contacts: 0 };
    }
  } catch { /* silencioso */ }
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
    if (!response.ok) throw new Error(data.details || data.error || 'No se pudo sondear los seguidores.');
    followersLatest.value = data.snapshot;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isPolling.value = false;
  }
}

function tagKind(type) {
  if (type === 'comment') return 'comment';
  if (type === 'reaction' || type === 'like') return 'reaction';
  if (type === 'share') return 'share';
  return 'post';
}

function iconFor(type) {
  const icons = { status: '📝', comment: '💬', reaction: '👍', like: '👍', share: '🔁', photo: '🖼️', video: '🎬' };
  return icons[type] || '📌';
}

function labelFor(type) {
  const labels = {
    status: 'Publicación', comment: 'Comentario', reaction: 'Reacción',
    like: 'Reacción', share: 'Compartido', photo: 'Foto', video: 'Video'
  };
  return labels[type] || type;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatShort(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

onMounted(fetchAll);
onBeforeUnmount(() => releaseImages());
</script>

<style scoped>
.social-page {
  padding: 1.75rem 2rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  width: 100%;
  box-sizing: border-box;
}

.social-subheading {
  max-width: 640px;
  margin-bottom: 0;
}

.social-subheading code {
  background: var(--surface-2);
  padding: 0.08rem 0.35rem;
  border-radius: 5px;
  font-size: 0.85em;
}

.social-refresh {
  width: auto;
  padding: 0.55rem 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.spin-animation {
  display: inline-block;
  animation: social-spin 0.9s linear infinite;
}

@keyframes social-spin {
  to { transform: rotate(360deg); }
}

.social-alert {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

/* KPIs */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.85rem;
}

.kpi-tile {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 0.95rem 1.1rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kpi-label { font-size: 0.76rem; color: var(--text-muted); }

.kpi-value {
  font-family: var(--font-heading);
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--text-main);
}

/* Seguidores */
.followers-card {
  padding: 1.1rem 1.35rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.followers-info { display: flex; align-items: center; gap: 0.85rem; }
.followers-icon { font-size: 1.7rem; }
.followers-info > div { display: flex; flex-direction: column; gap: 0.1rem; }
.followers-label { font-size: 0.8rem; color: var(--text-sub); }

.followers-value {
  font-family: var(--font-heading);
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--text-main);
}

.followers-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  max-width: 460px;
  line-height: 1.4;
}

/* Tabs */
.social-tabs {
  margin-bottom: 0;
  overflow-x: auto;
}

/* Grid de tarjetas */
.int-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(244px, 1fr));
  gap: 1rem;
}

.int-card {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.int-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.int-card.is-removed {
  opacity: 0.72;
  border-style: dashed;
}

.int-card.is-removed .int-card-media { filter: grayscale(0.65); }

.int-tag-removed {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(200, 85, 50, 0.9);
  color: #fff;
}

.int-card-message.is-struck {
  text-decoration: line-through;
  color: var(--text-muted);
}

.int-card-removed-note {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent-rose);
  margin: 0;
}

.int-card-media {
  position: relative;
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.int-card-media.media-comment { background: rgba(111, 129, 37, 0.12); }
.int-card-media.media-reaction { background: rgba(222, 117, 75, 0.14); }
.int-card-media.media-share { background: rgba(138, 63, 40, 0.12); }
.int-card-media.media-post { background: rgba(46, 125, 70, 0.12); }

.int-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.int-card-media-icon {
  font-size: 2.4rem;
  opacity: 0.7;
}

.int-tag {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  backdrop-filter: blur(4px);
  background: rgba(255, 255, 255, 0.85);
}

.int-tag-comment { color: var(--primary); }
.int-tag-reaction { color: var(--accent-rose); }
.int-tag-share { color: var(--accent-pink); }
.int-tag-post { color: var(--accent-emerald); }

:root[data-theme="dark"] .int-tag { background: rgba(16, 20, 20, 0.8); }

.int-card-body {
  padding: 0.8rem 0.9rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.int-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.int-card-sender {
  font-weight: 700;
  font-size: 0.86rem;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.int-card-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  flex-shrink: 0;
}

.int-card-message {
  font-size: 0.82rem;
  color: var(--text-sub);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.int-card-message-muted { color: var(--text-muted); font-style: italic; }

.int-card-post {
  font-size: 0.74rem;
  color: var(--text-muted);
  background: var(--surface-1);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  display: flex;
  gap: 0.35rem;
  line-height: 1.35;
}

.int-card-post-icon { flex-shrink: 0; }

.int-card-link {
  margin-top: auto;
  padding-top: 0.35rem;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.int-card-link:hover { text-decoration: underline; }

/* Messenger */
.messenger-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.messenger-title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.messenger-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-sub);
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}

.messenger-list { display: flex; flex-direction: column; gap: 0.5rem; }

.messenger-item {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.7rem 0.9rem;
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
}

.messenger-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-sub);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.messenger-body { flex: 1; min-width: 0; }

.messenger-item-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.messenger-sender { font-weight: 600; font-size: 0.84rem; color: var(--text-main); }
.messenger-time { font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono); }
.messenger-text { font-size: 0.82rem; color: var(--text-sub); margin: 0.2rem 0 0; line-height: 1.4; }

.empty-state-visual {
  width: 140px;
  height: 100px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin: 0 auto 1rem;
  border: 1px solid var(--border-color);
}

.empty-state-photo { width: 100%; height: 100%; object-fit: cover; display: block; }

@media (max-width: 768px) {
  .social-page { padding: 1rem; }
}
</style>
