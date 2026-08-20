<template>
  <main class="container-fluid whatsapp-page-wrapper">
    <header class="whatsapp-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">💚</span> Webhook de WhatsApp
        </h2>
        <p class="section-subheading">
          Mensajes entrantes de tus clientes vía WhatsApp Business Platform,
          recibidos en <code>/api/webhooks/whatsapp</code>.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-secondary" @click="fetchAll" :disabled="isLoading" title="Actualizar ahora">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span>
          {{ isLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
        <button
          class="btn-action-secondary"
          @click="autoRefresh = !autoRefresh"
          :class="{ 'is-active-toggle': autoRefresh }"
        >
          <span class="btn-icon">{{ autoRefresh ? '⏸️' : '▶️' }}</span>
          {{ autoRefresh ? 'Auto: ON' : 'Auto: OFF' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box alert-box">⚠️ {{ errorMessage }}</p>

    <section class="info-box">
      <h4>📋 Configuración en Meta</h4>
      <ul>
        <li>URL de devolución de llamada: <code>https://{{ hostHint }}/api/webhooks/whatsapp</code></li>
        <li>Identificador de verificación: el valor de <code>META_WHATSAPP_VERIFY_TOKEN</code> en tu <code>.env</code> de producción.</li>
        <li>Después de verificar, suscríbete al campo <strong>messages</strong>.</li>
      </ul>
    </section>

    <!-- Stats -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper green">💬</div>
        <div class="stat-info">
          <span class="stat-label">Mensajes recibidos</span>
          <span class="stat-value">{{ stats.total || 0 }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper blue">👤</div>
        <div class="stat-info">
          <span class="stat-label">Contactos distintos</span>
          <span class="stat-value">{{ stats.contacts || 0 }}</span>
        </div>
      </div>
    </section>

    <!-- Mensajes -->
    <h3 class="subsection-title">Mensajes recibidos</h3>
    <section v-if="!isLoading && messages.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>Aún no se ha recibido ningún mensaje de WhatsApp.</p>
      <p class="empty-hint">Envía un mensaje de prueba al número de WhatsApp Business conectado.</p>
    </section>

    <section v-else class="messages-list">
      <article v-for="msg in messages" :key="msg.id" class="message-card">
        <div class="message-icon">{{ iconFor(msg.message_type) }}</div>
        <div class="message-body">
          <div class="message-top">
            <span class="message-sender">{{ msg.contact_name || msg.wa_id }}</span>
            <span class="message-time">{{ formatTime(msg.received_at) }}</span>
          </div>
          <p class="message-phone">{{ msg.wa_id }}</p>
          <p v-if="msg.body" class="message-text">{{ msg.body }}</p>
        </div>
      </article>
    </section>

    <!-- Prueba de conexión cruda -->
    <h3 class="subsection-title">🔌 Prueba de conexión (eventos crudos)</h3>
    <section v-if="!isLoading && rawEvents.length === 0" class="empty-state small">
      <p>Sin eventos de prueba todavía. Usa el botón "Test" en Meta → WhatsApp → Webhooks.</p>
    </section>
    <section v-else class="events-list">
      <article v-for="event in rawEvents" :key="event.id" class="event-card">
        <header class="event-card-header">
          <span class="event-time">{{ formatTime(event.receivedAt) }}</span>
          <span class="signature-badge" :class="signatureBadgeClass(event)">{{ signatureBadgeText(event) }}</span>
        </header>
        <pre class="event-payload">{{ formatBody(event.body) }}</pre>
      </article>
    </section>
  </main>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const messages = ref([]);
const stats = ref({ total: 0, contacts: 0 });
const rawEvents = ref([]);
const isLoading = ref(false);
const errorMessage = ref('');
const autoRefresh = ref(true);
const hostHint = window.location.host;
let pollHandle = null;

async function fetchMessages() {
  try {
    const response = await apiFetch('/api/whatsapp/messages?limit=50');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener los mensajes.');
    messages.value = data.messages || [];
    stats.value = data.stats || { total: 0, contacts: 0 };
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchRawEvents() {
  try {
    const response = await apiFetch('/api/webhooks/whatsapp/events');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener los eventos.');
    rawEvents.value = data.events || [];
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchAll() {
  isLoading.value = true;
  errorMessage.value = '';
  await Promise.all([fetchMessages(), fetchRawEvents()]);
  isLoading.value = false;
}

function iconFor(type) {
  const icons = { text: '💬', image: '🖼️', video: '🎬', audio: '🎧', document: '📄', location: '📍', sticker: '🩹', button: '🔘', interactive: '🔘' };
  return icons[type] || '📨';
}

function signatureBadgeClass(event) {
  if (!event.hasSecret) return 'badge-neutral';
  return event.signatureValid ? 'badge-ok' : 'badge-error';
}

function signatureBadgeText(event) {
  if (!event.hasSecret) return 'Sin verificar (META_APP_SECRET vacío)';
  return event.signatureValid ? '✅ Firma válida' : '❌ Firma inválida';
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function formatBody(body) {
  return JSON.stringify(body, null, 2);
}

onMounted(() => {
  fetchAll();
  pollHandle = setInterval(() => {
    if (autoRefresh.value) fetchAll();
  }, 4000);
});

onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle);
});
</script>

<style scoped>
.whatsapp-page-wrapper {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.whatsapp-header {
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

.section-subheading code, .info-box code {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.35rem;
  border-radius: 5px;
  font-size: 0.85em;
  word-break: break-all;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn-action-secondary {
  background: rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.1);
}

.btn-action-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action-secondary.is-active-toggle {
  border-color: var(--primary);
  color: var(--accent-cyan);
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
  color: #fca5a5;
}

.subsection-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  color: var(--text-main);
  margin-top: 0.5rem;
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

.empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--text-sub);
}

.empty-state.small {
  padding: 1.25rem 1rem;
  font-size: 0.85rem;
}

.empty-icon {
  font-size: 2.2rem;
  display: block;
  margin-bottom: 0.6rem;
}

.empty-hint {
  font-size: 0.85rem;
  opacity: 0.75;
  margin-top: 0.25rem;
}

.messages-list, .events-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.message-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.9rem 1.1rem;
  display: flex;
  gap: 0.85rem;
}

.message-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.message-sender {
  font-weight: 600;
  color: var(--text-main);
  font-size: 0.88rem;
}

.message-time {
  font-size: 0.78rem;
  color: var(--text-sub);
}

.message-phone {
  font-size: 0.75rem;
  color: var(--text-sub);
  opacity: 0.75;
  margin-top: 0.1rem;
}

.message-text {
  font-size: 0.85rem;
  color: var(--text-sub);
  margin-top: 0.3rem;
  overflow-wrap: break-word;
}

.event-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.1rem;
}

.event-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.event-time {
  font-size: 0.82rem;
  color: var(--text-sub);
  font-family: var(--font-heading);
}

.signature-badge {
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.badge-neutral {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-sub);
}

.badge-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.badge-error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.event-payload {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  color: var(--text-sub);
  overflow-x: auto;
  white-space: pre;
  font-family: 'Courier New', monospace;
  margin: 0;
}

@media (max-width: 768px) {
  .whatsapp-page-wrapper {
    padding: 1rem;
  }
}
</style>
