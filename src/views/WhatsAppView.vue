<template>
  <main class="container-fluid whatsapp-page-wrapper">
    <header class="whatsapp-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">💚</span> WhatsApp
        </h2>
        <p class="section-subheading">
          Conversaciones con tus clientes vía WhatsApp Business Platform,
          recibidas en <code>/api/webhooks/whatsapp</code>.
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
        <li>Para responder, necesitas configurar <code>META_WHATSAPP_PHONE_NUMBER_ID</code> y <code>META_WHATSAPP_ACCESS_TOKEN</code> (con permiso <code>whatsapp_business_messaging</code>).</li>
        <li>Solo puedes enviar mensajes de texto libre dentro de las <strong>24 horas</strong> desde el último mensaje del cliente; fuera de esa ventana, WhatsApp exige una plantilla aprobada.</li>
        <li>Cuando alguien escribe después de tocar "Enviar mensaje" en un anuncio o publicación de Facebook/Instagram, WhatsApp lo indica automáticamente en el mensaje — por eso cada conversación muestra su canal de origen (📘 Facebook, 📸 Instagram o 💬 directo).</li>
      </ul>
    </section>

    <!-- Stats -->
    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper green">💬</div>
        <div class="stat-info">
          <span class="stat-label">Mensajes totales</span>
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

    <!-- Bandeja de conversaciones -->
    <h3 class="subsection-title">Conversaciones</h3>
    <section v-if="!isLoading && conversations.length === 0" class="empty-state">
      <span class="empty-icon">📭</span>
      <p>Aún no se ha recibido ningún mensaje de WhatsApp.</p>
      <p class="empty-hint">Envía un mensaje de prueba al número de WhatsApp Business conectado.</p>
    </section>

    <section v-else class="whatsapp-inbox">
      <div class="contacts-panel">
        <button
          v-for="c in conversations"
          :key="c.wa_id"
          class="contact-item"
          :class="{ 'is-active': c.wa_id === selectedWaId }"
          @click="selectConversation(c.wa_id)"
        >
          <span class="contact-avatar">{{ iconFor(c.message_type) }}</span>
          <span class="contact-info">
            <span class="contact-name">{{ c.contact_name || c.wa_id }}</span>
            <span class="contact-preview">{{ c.direction === 'outbound' ? 'Tú: ' : '' }}{{ truncate(c.body, 40) }}</span>
          </span>
          <span class="contact-side">
            <span class="channel-badge" :class="channelBadgeClass(c.origin_channel)" :title="c.origin_channel">
              {{ channelIcon(c.origin_channel) }}
            </span>
            <span class="contact-time">{{ formatShortTime(c.received_at) }}</span>
          </span>
        </button>
      </div>

      <div class="thread-panel">
        <template v-if="selectedWaId">
          <header class="thread-header">
            <strong>{{ selectedContactName }}</strong>
            <span class="thread-phone">{{ selectedWaId }}</span>
            <span v-if="threadOriginChannel" class="channel-badge" :class="channelBadgeClass(threadOriginChannel)">
              {{ channelIcon(threadOriginChannel) }} {{ threadOriginChannel }}
            </span>
          </header>

          <div v-if="threadReferral" class="origin-banner">
            🎯 Este contacto escribió después de tocar
            <strong>{{ threadReferral.source_type === 'post' ? 'una publicación' : 'un anuncio' }}</strong>
            de Meta<span v-if="threadReferral.headline">: "{{ threadReferral.headline }}"</span>.
          </div>

          <div class="thread-messages" ref="threadScrollEl">
            <div
              v-for="msg in thread"
              :key="msg.id"
              class="bubble"
              :class="msg.direction === 'outbound' ? 'outbound' : 'inbound'"
            >
              <p class="bubble-text">{{ msg.body }}</p>
              <span class="bubble-meta">
                {{ formatShortTime(msg.received_at) }}
                <span v-if="msg.direction === 'outbound'" :title="msg.status_error || ''">{{ statusTick(msg.status) }}</span>
              </span>
              <p v-if="msg.status === 'failed' && msg.status_error" class="bubble-error">⚠️ {{ msg.status_error }}</p>
            </div>
          </div>

          <form class="reply-box" @submit.prevent="sendReply">
            <textarea
              v-model="replyText"
              class="reply-input"
              placeholder="Escribe una respuesta..."
              rows="2"
              @keydown.enter.exact.prevent="sendReply"
            ></textarea>
            <button type="submit" class="btn-send" :disabled="isSending || !replyText.trim()">
              {{ isSending ? 'Enviando...' : 'Enviar' }}
            </button>
          </form>
        </template>

        <div v-else class="thread-placeholder">
          <span class="empty-icon">💬</span>
          <p>Selecciona una conversación para ver el hilo y responder.</p>
        </div>
      </div>
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
import { nextTick, onMounted, onUnmounted, computed, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const conversations = ref([]);
const stats = ref({ total: 0, contacts: 0 });
const rawEvents = ref([]);
const isLoading = ref(false);
const errorMessage = ref('');
const autoRefresh = ref(true);
const hostHint = window.location.host;

const selectedWaId = ref(null);
const thread = ref([]);
const replyText = ref('');
const isSending = ref(false);
const threadScrollEl = ref(null);

let pollHandle = null;

const selectedContactName = computed(() => {
  const conv = conversations.value.find((c) => c.wa_id === selectedWaId.value);
  return conv?.contact_name || selectedWaId.value;
});

const threadOriginChannel = computed(() => {
  const conv = conversations.value.find((c) => c.wa_id === selectedWaId.value);
  return conv?.origin_channel || null;
});

const threadReferral = computed(() => {
  const first = thread.value.find((m) => m.direction === 'inbound' && m.referral);
  if (!first) return null;
  try {
    return typeof first.referral === 'string' ? JSON.parse(first.referral) : first.referral;
  } catch {
    return null;
  }
});

async function fetchConversations() {
  try {
    const response = await apiFetch('/api/whatsapp/conversations');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener las conversaciones.');
    conversations.value = data.conversations || [];
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchStats() {
  try {
    const response = await apiFetch('/api/whatsapp/messages?limit=1');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener las estadísticas.');
    stats.value = data.stats || { total: 0, contacts: 0 };
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchThread(waId, { scrollToBottom = false } = {}) {
  try {
    const response = await apiFetch(`/api/whatsapp/conversations/${encodeURIComponent(waId)}/messages`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener el hilo.');
    thread.value = data.messages || [];
    if (scrollToBottom) {
      await nextTick();
      threadScrollEl.value?.scrollTo({ top: threadScrollEl.value.scrollHeight });
    }
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function selectConversation(waId) {
  if (!waId) return;
  selectedWaId.value = waId;
  fetchThread(waId, { scrollToBottom: true });
}

async function sendReply() {
  const body = replyText.value.trim();
  if (!body || !selectedWaId.value) return;

  isSending.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch(`/api/whatsapp/conversations/${encodeURIComponent(selectedWaId.value)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || 'No se pudo enviar el mensaje.');
    replyText.value = '';
    await Promise.all([fetchThread(selectedWaId.value, { scrollToBottom: true }), fetchConversations()]);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSending.value = false;
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
  const tasks = [fetchConversations(), fetchStats(), fetchRawEvents()];
  if (selectedWaId.value) tasks.push(fetchThread(selectedWaId.value));
  await Promise.all(tasks);
  isLoading.value = false;
}

function iconFor(type) {
  const icons = { text: '💬', image: '🖼️', video: '🎬', audio: '🎧', document: '📄', location: '📍', sticker: '🩹', button: '🔘', interactive: '🔘' };
  return icons[type] || '📨';
}

function channelIcon(channel) {
  const icons = { 'Facebook Ads': '📘', 'Instagram Ads': '📸', 'Anuncio de Meta': '🎯', 'Publicación de Meta': '📝' };
  return icons[channel] || '💬';
}

function channelBadgeClass(channel) {
  if (channel === 'Facebook Ads') return 'channel-fb';
  if (channel === 'Instagram Ads') return 'channel-ig';
  if (channel === 'WhatsApp Directo' || !channel) return 'channel-direct';
  return 'channel-ad';
}

function statusTick(status) {
  if (status === 'read') return '✓✓';
  if (status === 'delivered') return '✓✓';
  if (status === 'sent') return '✓';
  if (status === 'failed') return '⚠️';
  return '';
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

function formatShortTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
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

/* Inbox */
.whatsapp-inbox {
  display: flex;
  gap: 1rem;
  height: 560px;
}

.contacts-panel {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-right: 0.25rem;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  text-align: left;
  color: var(--text-main);
  transition: all 0.15s ease;
}

.contact-item:hover {
  background: var(--bg-card-hover);
}

.contact-item.is-active {
  border-color: var(--primary);
  background: rgba(16, 94, 255, 0.12);
}

.contact-avatar {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.contact-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.contact-name {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-preview {
  font-size: 0.75rem;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  flex-shrink: 0;
}

.contact-time {
  font-size: 0.68rem;
  color: var(--text-sub);
  opacity: 0.7;
  flex-shrink: 0;
  white-space: nowrap;
}

.channel-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}

.channel-fb {
  background: rgba(24, 119, 242, 0.15);
  color: #5b9dff;
}

.channel-ig {
  background: rgba(225, 48, 108, 0.15);
  color: #f0578a;
}

.channel-direct {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-sub);
}

.channel-ad {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.origin-banner {
  background: rgba(245, 158, 11, 0.1);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-sub);
  font-size: 0.78rem;
  padding: 0.6rem 1.1rem;
}

.thread-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}

.thread-header {
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.thread-phone {
  font-size: 0.78rem;
  color: var(--text-sub);
}

.thread-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bubble {
  max-width: 70%;
  padding: 0.55rem 0.8rem;
  border-radius: 12px;
  font-size: 0.85rem;
}

.bubble.inbound {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  border-bottom-left-radius: 3px;
}

.bubble.outbound {
  align-self: flex-end;
  background: var(--primary);
  color: #ffffff;
  border-bottom-right-radius: 3px;
}

.bubble-text {
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.bubble-meta {
  display: block;
  font-size: 0.68rem;
  opacity: 0.75;
  margin-top: 0.25rem;
  text-align: right;
}

.bubble-error {
  font-size: 0.72rem;
  color: #fde68a;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  margin-top: 0.3rem;
  overflow-wrap: break-word;
}

.reply-box {
  display: flex;
  gap: 0.6rem;
  padding: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.reply-input {
  flex: 1;
  resize: none;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: 0.85rem;
}

.reply-input:focus {
  outline: none;
  border-color: var(--primary);
}

.btn-send {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 0 1.2rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-send:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thread-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-sub);
  text-align: center;
  padding: 1rem;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

@media (max-width: 900px) {
  .whatsapp-inbox {
    flex-direction: column;
    height: auto;
  }

  .contacts-panel {
    width: 100%;
    max-height: 220px;
  }

  .thread-panel {
    height: 480px;
  }
}

@media (max-width: 768px) {
  .whatsapp-page-wrapper {
    padding: 1rem;
  }
}
</style>
