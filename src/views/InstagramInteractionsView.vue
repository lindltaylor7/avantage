<template>
  <main class="container-fluid ig-page-wrapper">
    <!-- Header de Instagram -->
    <header class="ig-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon ig-gradient-icon">📸</span> Interacciones de Instagram
        </h2>
        <p class="section-subheading">
          Comentarios, menciones, respuestas a historias y mensajes directos (DMs) recibidos en tu cuenta de Instagram Business conectada.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-primary ig-btn-gradient" @click="fetchAll" :disabled="isLoading" title="Actualizar ahora">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span>
          {{ isLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box alert-box">⚠️ {{ errorMessage }}</p>

    <!-- Estado de conexión: adaptativo según si hay datos reales o no -->
    <section v-if="profile && !profile.connected" class="ig-connect-card">
      <div class="ig-connect-header">
        <span class="ig-connect-icon">🔑</span>
        <div>
          <strong class="ig-connect-title">Instagram Graph API no conectado</strong>
          <p class="ig-connect-reason">{{ profile.error || 'Falta configurar las credenciales de Meta.' }}</p>
        </div>
      </div>

      <ul class="ig-connect-checklist" v-if="configStatus">
        <li :class="configStatus.hasPageAccessToken ? 'ok' : 'missing'">
          {{ configStatus.hasPageAccessToken ? '✅' : '❌' }} <code>META_PAGE_ACCESS_TOKEN</code>
          <span class="ig-connect-hint">token de la Página, con permisos instagram_basic, instagram_manage_comments, pages_read_engagement y business_management</span>
        </li>
        <li :class="configStatus.hasInstagramAccountId ? 'ok' : 'optional'">
          {{ configStatus.hasInstagramAccountId ? '✅' : '➖' }} <code>META_INSTAGRAM_ACCOUNT_ID</code>
          <span class="ig-connect-hint">opcional: solo si no se puede resolver automáticamente desde el token</span>
        </li>
        <li :class="configStatus.hasAppSecret ? 'ok' : 'missing'">
          {{ configStatus.hasAppSecret ? '✅' : '❌' }} <code>META_APP_SECRET</code>
          <span class="ig-connect-hint">valida la firma de los webhooks entrantes de comentarios/mensajes</span>
        </li>
      </ul>

      <p class="ig-connect-steps">
        1) En Meta Business Suite, vincula tu cuenta de Instagram Profesional a tu Página de Facebook.
        2) Genera un token de Página con los permisos de arriba (Meta Developers → Graph API Explorer, o "Inicio de sesión con Facebook para empresas").
        3) Pega el token en <code>META_PAGE_ACCESS_TOKEN</code> dentro de tu <code>.env</code> y reinicia el servidor.
      </p>
    </section>

    <section v-else-if="profile?.connected" class="ig-connected-bar">
      ✅ Conectado a la Graph API como <strong>@{{ profile.username }}</strong> — mostrando datos reales.
    </section>

    <!-- Tarjeta de Perfil de Instagram (solo con datos reales) -->
    <section v-if="profile?.connected" class="ig-profile-card">
      <div class="ig-profile-main">
        <div class="ig-avatar-wrapper">
          <div class="ig-avatar-gradient-ring">
            <img v-if="profile.profile_picture_url" :src="profile.profile_picture_url" alt="" class="ig-avatar-img" />
            <div v-else class="ig-avatar-inner">
              <span class="ig-avatar-emoji">📸</span>
            </div>
          </div>
          <span class="ig-status-dot connected" title="Conectado a Graph API en vivo"></span>
        </div>

        <div class="ig-profile-info">
          <div class="ig-username-row">
            <h3 class="ig-username">@{{ profile.username }}</h3>
            <span class="ig-badge-type">Instagram Business En Vivo</span>
          </div>
          <h4 class="ig-display-name">{{ profile.name }}</h4>
          <p class="ig-bio" v-if="profile.biography">{{ profile.biography }}</p>
          <a v-if="profile.website" :href="profile.website" target="_blank" rel="noopener" class="ig-website-link">
            🔗 {{ profile.website }}
          </a>
        </div>
      </div>

      <div class="ig-profile-metrics">
        <div class="metric-box">
          <span class="metric-num">{{ profile.followers_count?.toLocaleString() ?? 0 }}</span>
          <span class="metric-label">Seguidores</span>
        </div>
        <div class="metric-box">
          <span class="metric-num">{{ profile.follows_count?.toLocaleString() ?? 0 }}</span>
          <span class="metric-label">Seguidos</span>
        </div>
        <div class="metric-box">
          <span class="metric-num">{{ profile.media_count ?? 0 }}</span>
          <span class="metric-label">Publicaciones</span>
        </div>
      </div>
    </section>

    <!-- Grid de Métricas de Interacción -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper ig-stat-pink">💬</div>
        <div class="stat-info">
          <span class="stat-label">Total Interacciones</span>
          <span class="stat-value">{{ stats.total || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper ig-stat-orange">💭</div>
        <div class="stat-info">
          <span class="stat-label">Comentarios en Posts</span>
          <span class="stat-value">{{ stats.comments || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper ig-stat-purple">🏷️</div>
        <div class="stat-info">
          <span class="stat-label">Menciones / Historias</span>
          <span class="stat-value">{{ stats.mentions || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper ig-stat-blue">📩</div>
        <div class="stat-info">
          <span class="stat-label">Mensajes Directos (DMs)</span>
          <span class="stat-value">{{ stats.dms || 0 }}</span>
        </div>
      </div>
    </section>

    <!-- Filtro por Tipo de Interacción -->
    <div class="filter-pills-bar">
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

      <div class="view-switch-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'interactions' }"
          @click="activeTab = 'interactions'"
        >
          💬 Feed de Interacciones
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'media' }"
          @click="activeTab = 'media'"
        >
          🎬 Posts & Reels ({{ mediaList.length }})
        </button>
      </div>
    </div>

    <!-- TAB 1: Feed de Interacciones -->
    <section v-if="activeTab === 'interactions'">
      <div v-if="!isLoading && interactions.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <p>Aún no se han registrado interacciones de Instagram.</p>
        <p class="empty-hint">Publica un comentario o envía un mensaje de prueba a tu cuenta de Instagram.</p>
      </div>

      <div v-else class="interactions-list">
        <article
          v-for="item in interactions"
          :key="item.id"
          class="ig-interaction-card"
          :class="'type-' + (item.item_type || 'comment')"
        >
          <div class="ig-card-left">
            <div class="ig-user-avatar">
              {{ getUserInitial(item.sender_name) }}
            </div>
          </div>

          <div class="ig-card-content">
            <div class="ig-card-top">
              <div class="ig-user-details">
                <strong class="ig-card-handle">@{{ item.sender_name || item.sender_id || 'usuario_instagram' }}</strong>
                <span class="ig-type-badge" :class="'badge-' + (item.item_type || 'comment')">
                  {{ iconFor(item.item_type) }} {{ labelFor(item.item_type) }}
                </span>
              </div>
              <span class="interaction-time">{{ formatTime(item.received_at) }}</span>
            </div>

            <!-- Mensaje o Comentario -->
            <p v-if="item.message" class="ig-card-message">
              "{{ item.message }}"
            </p>

            <!-- Referencia al Post / Reel si aplica -->
            <div v-if="item.post_message || item.post_id" class="ig-post-reference">
              <span class="ig-ref-icon">📸</span>
              <div class="ig-ref-content">
                <span class="ig-ref-label">En publicación:</span>
                <span class="ig-ref-text">{{ truncate(item.post_message || item.post_id, 90) }}</span>
              </div>
              <a v-if="item.post_permalink_url" :href="item.post_permalink_url" target="_blank" rel="noopener" class="ig-link-btn">
                Ver en Instagram ↗
              </a>
            </div>

            <!-- Acciones Rápidas -->
            <div class="ig-card-actions">
              <router-link to="/admin/setter-funnel" class="ig-quick-btn setter">
                🎯 Ver en Setter Funnel
              </router-link>
              <a
                v-if="item.post_permalink_url"
                :href="item.post_permalink_url"
                target="_blank"
                rel="noopener"
                class="ig-quick-btn external"
              >
                👁️ Responder en Instagram
              </a>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- TAB 2: Publicaciones & Reels Recientes -->
    <section v-if="activeTab === 'media'" class="ig-media-grid">
      <div v-if="mediaList.length === 0" class="empty-state">
        <span class="empty-icon">🎬</span>
        <p>No se encontraron publicaciones recientes de Instagram.</p>
      </div>

      <article v-for="media in mediaList" :key="media.id" class="ig-media-card">
        <div class="ig-media-header">
          <span class="ig-media-type-tag">
            {{ media.media_type === 'VIDEO' ? '🎥 Reel' : (media.media_type === 'CAROUSEL_ALBUM' ? '📚 Carrusel' : '🖼️ Foto') }}
          </span>
          <span class="ig-media-date">{{ formatTime(media.timestamp) }}</span>
        </div>

        <p class="ig-media-caption">{{ truncate(media.caption, 160) }}</p>

        <div class="ig-media-footer">
          <div class="ig-media-stats">
            <span class="stat-pill" title="Me gusta">❤️ {{ media.like_count || 0 }}</span>
            <span class="stat-pill" title="Comentarios">💬 {{ media.comments_count || 0 }}</span>
          </div>
          <a v-if="media.permalink" :href="media.permalink" target="_blank" rel="noopener" class="ig-media-link">
            Abrir Post ↗
          </a>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

const TYPE_FILTERS = [
  { id: null, label: 'Todos' },
  { id: 'comment', label: '💬 Comentarios' },
  { id: 'mention', label: '🏷️ Menciones' },
  { id: 'direct_message', label: '📩 Mensajes Directos' },
  { id: 'story_reply', label: '📱 Historias' }
];

const activeTab = ref('interactions');
const profile = ref(null);
const configStatus = ref(null);
const interactions = ref([]);
const mediaList = ref([]);
const stats = ref({ total: 0, comments: 0, mentions: 0, dms: 0, reactions: 0 });
const isLoading = ref(false);
const errorMessage = ref('');
const selectedType = ref(null);

async function fetchProfile() {
  try {
    const res = await apiFetch('/api/instagram/profile');
    const data = await res.json();
    if (res.ok) {
      profile.value = data.profile;
    }
  } catch (err) {
    console.warn('Error al cargar perfil de Instagram:', err);
  }
}

async function fetchConfigStatus() {
  try {
    const res = await apiFetch('/api/instagram/config-status');
    const data = await res.json();
    if (res.ok) configStatus.value = data;
  } catch (err) {
    console.warn('Error al cargar el estado de configuración de Instagram:', err);
  }
}

async function fetchInteractions() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (selectedType.value) params.set('itemType', selectedType.value);
    const res = await apiFetch(`/api/instagram/interactions?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al obtener interacciones');
    interactions.value = data.interactions || [];
    stats.value = data.stats || { total: 0, comments: 0, mentions: 0, dms: 0, reactions: 0 };
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function fetchMedia() {
  try {
    const res = await apiFetch('/api/instagram/media?limit=12');
    const data = await res.json();
    if (res.ok && Array.isArray(data.media)) {
      mediaList.value = data.media;
    }
  } catch (err) {
    console.warn('Error al cargar media de Instagram:', err);
  }
}

async function fetchAll() {
  await Promise.all([fetchProfile(), fetchConfigStatus(), fetchInteractions(), fetchMedia()]);
}

function getUserInitial(name) {
  if (!name) return 'IG';
  return name.replace('@', '').charAt(0).toUpperCase();
}

function iconFor(type) {
  const icons = {
    comment: '💬',
    mention: '🏷️',
    direct_message: '📩',
    message: '📩',
    story_reply: '📱',
    reaction: '❤️',
    like: '❤️'
  };
  return icons[type] || '📸';
}

function labelFor(type) {
  const labels = {
    comment: 'Comentario',
    mention: 'Mención',
    direct_message: 'Mensaje Directo',
    message: 'Mensaje Directo',
    story_reply: 'Respuesta a Historia',
    reaction: 'Reacción',
    like: 'Me gusta'
  };
  return labels[type] || 'Interacción';
}

function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

onMounted(fetchAll);
</script>

<style scoped>
.ig-page-wrapper {
  padding: 1.5rem 2rem;
  max-width: 100%;
  box-sizing: border-box;
}

/* Header */
.ig-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.header-titles {
  max-width: 780px;
}

.section-heading {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
}

.ig-gradient-icon {
  background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.section-subheading {
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-action-primary.ig-btn-gradient {
  background: linear-gradient(45deg, #f09433 0%, #dc2743 50%, #bc1888 100%);
  color: #fff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 15px rgba(220, 39, 67, 0.4);
  transition: all 0.25s ease;
}

.btn-action-primary.ig-btn-gradient:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(220, 39, 67, 0.55);
}

.spin-animation {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Tarjeta de Perfil de Instagram */
.ig-profile-card {
  background: linear-gradient(135deg, rgba(220, 39, 67, 0.08) 0%, rgba(188, 24, 136, 0.05) 50%, var(--bg-card) 100%);
  border: 1px solid rgba(220, 39, 67, 0.3);
  border-radius: 20px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  backdrop-filter: blur(14px);
  box-shadow: 0 15px 35px -15px rgba(220, 39, 67, 0.2);
}

.ig-profile-main {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.ig-avatar-wrapper {
  position: relative;
}

.ig-avatar-gradient-ring {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ig-avatar-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #18181B;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.ig-status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #F59E0B;
  border: 2px solid #18181B;
}

.ig-status-dot.connected {
  background: #10B981;
}

.ig-profile-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.ig-username-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.ig-username {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.ig-badge-type {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-sub);
  font-size: 0.72rem;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  font-weight: 600;
}

.ig-display-name {
  font-size: 0.92rem;
  color: #F472B6;
  margin: 0;
  font-weight: 600;
}

.ig-bio {
  font-size: 0.85rem;
  color: var(--text-sub);
  margin: 0.2rem 0;
  max-width: 520px;
  line-height: 1.4;
}

.ig-website-link {
  font-size: 0.82rem;
  color: #60A5FA;
  text-decoration: none;
  font-weight: 500;
}

.ig-website-link:hover {
  text-decoration: underline;
}

.ig-profile-metrics {
  display: flex;
  gap: 1.5rem;
}

.metric-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  min-width: 85px;
}

.metric-num {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-main);
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 600;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.15rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  backdrop-filter: blur(12px);
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

.ig-stat-pink { background: rgba(217, 70, 239, 0.15); color: #D946EF; }
.ig-stat-orange { background: rgba(249, 115, 22, 0.15); color: #F97316; }
.ig-stat-purple { background: rgba(168, 85, 247, 0.15); color: #A855F7; }
.ig-stat-blue { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.2;
}

/* Tarjeta de conexión (desconectado) */
.ig-connect-card {
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 16px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.ig-connect-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.ig-connect-icon {
  font-size: 1.4rem;
}

.ig-connect-title {
  color: var(--accent-amber);
  font-size: 0.95rem;
}

.ig-connect-reason {
  margin: 0.25rem 0 0;
  color: var(--text-sub);
  font-size: 0.85rem;
  line-height: 1.45;
}

.ig-connect-checklist {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0.85rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.ig-connect-checklist li.ok { color: var(--accent-emerald, #10B981); }
.ig-connect-checklist li.missing { color: #fca5a5; }
.ig-connect-checklist li.optional { color: var(--text-muted); }

.ig-connect-hint {
  display: block;
  color: var(--text-muted);
  font-size: 0.75rem;
  margin-top: 0.15rem;
  margin-left: 1.4rem;
}

.ig-connect-steps {
  margin: 0.9rem 0 0;
  font-size: 0.82rem;
  color: var(--text-sub);
  line-height: 1.6;
}

/* Barra de conectado */
.ig-connected-bar {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34D399;
  border-radius: 12px;
  padding: 0.65rem 1rem;
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.ig-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

/* Toolbar & Tabs */
.filter-pills-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filter-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 0.45rem 0.85rem;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.filter-pill.active {
  background: linear-gradient(45deg, rgba(240, 148, 51, 0.2), rgba(188, 24, 136, 0.25));
  border-color: #EC4899;
  color: #F472B6;
}

.view-switch-tabs {
  display: flex;
  gap: 0.4rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.3rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* Lista de Interacciones */
.interactions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ig-interaction-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  transition: all 0.2s ease;
  backdrop-filter: blur(12px);
}

.ig-interaction-card:hover {
  transform: translateY(-2px);
  border-color: rgba(236, 72, 153, 0.4);
  box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.5);
}

.ig-card-left {
  flex-shrink: 0;
}

.ig-user-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f09433 0%, #dc2743 50%, #bc1888 100%);
  color: #fff;
  font-weight: 800;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ig-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ig-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ig-user-details {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.ig-card-handle {
  font-size: 0.95rem;
  color: var(--text-main);
}

.ig-type-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 8px;
}

.badge-comment { background: rgba(249, 115, 22, 0.18); color: #FB923C; }
.badge-mention { background: rgba(168, 85, 247, 0.18); color: #C084FC; }
.badge-direct_message, .badge-message { background: rgba(59, 130, 246, 0.18); color: #60A5FA; }
.badge-story_reply { background: rgba(236, 72, 153, 0.18); color: #F472B6; }

.interaction-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.ig-card-message {
  font-size: 0.92rem;
  color: var(--text-sub);
  line-height: 1.45;
  margin: 0;
}

.ig-post-reference {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.ig-ref-icon {
  font-size: 1rem;
}

.ig-ref-content {
  flex: 1;
  display: flex;
  gap: 0.35rem;
  overflow: hidden;
}

.ig-ref-label {
  color: var(--text-muted);
  white-space: nowrap;
}

.ig-ref-text {
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ig-link-btn {
  color: #F472B6;
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}

.ig-card-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.ig-quick-btn {
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: all 0.2s ease;
}

.ig-quick-btn.setter {
  background: rgba(6, 182, 212, 0.15);
  color: #22D3EE;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.ig-quick-btn.setter:hover {
  background: rgba(6, 182, 212, 0.25);
}

.ig-quick-btn.external {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}

.ig-quick-btn.external:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* Grid de Publicaciones & Reels */
.ig-media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.ig-media-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.85rem;
  backdrop-filter: blur(12px);
  transition: all 0.2s ease;
}

.ig-media-card:hover {
  transform: translateY(-2px);
  border-color: rgba(236, 72, 153, 0.4);
}

.ig-media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ig-media-type-tag {
  background: rgba(236, 72, 153, 0.15);
  color: #F472B6;
  padding: 0.2rem 0.55rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
}

.ig-media-date {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.ig-media-caption {
  font-size: 0.85rem;
  color: var(--text-sub);
  line-height: 1.45;
  margin: 0;
}

.ig-media-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.ig-media-stats {
  display: flex;
  gap: 0.6rem;
}

.stat-pill {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 600;
}

.ig-media-link {
  font-size: 0.8rem;
  color: #F472B6;
  text-decoration: none;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: 16px;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.empty-hint {
  font-size: 0.82rem;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .ig-page-wrapper {
    padding: 1rem;
  }
  .ig-profile-card {
    flex-direction: column;
    align-items: flex-start;
  }
  .ig-profile-metrics {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
