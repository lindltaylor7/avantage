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
    <p v-if="resetMessage" class="info-box success-box">✅ {{ resetMessage }}</p>

    <!-- Estado de credenciales: por qué el bot podría no estar respondiendo -->
    <section v-if="configStatus" class="config-status-banner" :class="{ 'is-ok': allWhatsappConfigOk }">
      <h4>{{ allWhatsappConfigOk ? '✅ Envío de WhatsApp configurado' : '⚠️ El bot no puede enviar mensajes reales todavía' }}</h4>
      <ul class="config-status-list">
        <li :class="configStatus.whatsapp.hasPhoneNumberId ? 'ok' : 'missing'">
          {{ configStatus.whatsapp.hasPhoneNumberId ? '✅' : '❌' }} <code>META_WHATSAPP_PHONE_NUMBER_ID</code>
        </li>
        <li :class="configStatus.whatsapp.hasAccessToken ? 'ok' : 'missing'">
          {{ configStatus.whatsapp.hasAccessToken ? '✅' : '❌' }} <code>META_WHATSAPP_ACCESS_TOKEN</code> (o <code>META_PAGE_ACCESS_TOKEN</code>)
        </li>
        <li :class="configStatus.whatsapp.hasAppSecret ? 'ok' : 'missing'">
          {{ configStatus.whatsapp.hasAppSecret ? '✅' : '❌' }} <code>META_APP_SECRET</code> (firma del webhook)
        </li>
        <li :class="configStatus.ollama.hasApiKey ? 'ok' : 'missing'">
          {{ configStatus.ollama.hasApiKey ? '✅' : '⚠️' }} <code>OLLAMA_API_KEY</code>
          <span class="config-status-hint">({{ configStatus.ollama.chatModel }} en {{ configStatus.ollama.host }}{{ configStatus.ollama.hasApiKey ? '' : ', usará el saludo de respaldo' }})</span>
        </li>
      </ul>
      <p v-if="!allWhatsappConfigOk" class="config-status-note">
        Mientras falten las variables de WhatsApp, el bot sí procesa los mensajes y sí llama al LLM
        (puedes verlo abajo en "Actividad del bot"), pero la respuesta final falla al intentar
        enviarse por la Graph API. Usa el simulador de abajo para probar el flujo sin depender del
        envío real.
      </p>
    </section>

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

    <!-- Simulador de prueba del bot + LLM -->
    <h3 class="subsection-title">🧪 Simulador de prueba (bot + LLM de Ollama Cloud)</h3>
    <section class="info-box">
      <p>
        Simula mensajes entrantes de un contacto sin depender del webhook real de Meta ni del envío
        por WhatsApp. Útil para ver que el agrupado de 5 segundos y la llamada al LLM funcionan.
        Usa un <strong>wa_id de prueba</strong> (no un número real) para no mezclarlo con leads reales.
      </p>
    </section>
    <section class="simulator-panel">
      <form class="simulator-form" @submit.prevent="sendSimulatedMessage">
        <div class="simulator-field">
          <label class="field-label">wa_id de prueba</label>
          <input v-model="simWaId" type="text" class="form-input-sm" placeholder="test-12345" />
        </div>
        <div class="simulator-field simulator-field-grow">
          <label class="field-label">Mensaje a simular</label>
          <input
            v-model="simText"
            type="text"
            class="form-input-sm"
            placeholder="Ej: hola, quiero saber sobre mi tesis"
            @keydown.enter.prevent="sendSimulatedMessage"
          />
        </div>
        <button type="submit" class="btn-send" :disabled="isSimulating || !simText.trim() || !simWaId.trim()">
          {{ isSimulating ? 'Enviando...' : '📤 Simular mensaje' }}
        </button>
        <button type="button" class="btn-action-secondary" @click="resetSimWaId">🆕 Nuevo wa_id de prueba</button>
      </form>

      <div class="simulator-history" v-if="simMessagesSent.length">
        <span class="preview-label">Mensajes simulados enviados a <code>{{ simWaId }}</code>:</span>
        <div class="sim-message-chips">
          <span v-for="(m, i) in simMessagesSent" :key="i" class="sim-message-chip">{{ m }}</span>
        </div>
      </div>
    </section>

    <!-- Actividad del bot: visibilidad de lo que se manda/recibe del LLM -->
    <h3 class="subsection-title">
      📊 Actividad del bot / LLM
      <button type="button" class="btn-clear-activity" @click="clearActivity" title="Limpiar bitácora">🗑️ Limpiar</button>
    </h3>
    <section v-if="!isLoading && botActivity.length === 0" class="empty-state small">
      <p>Sin actividad todavía. Escribe por WhatsApp o usa el simulador de arriba.</p>
    </section>
    <section v-else class="activity-list">
      <article v-for="entry in botActivity" :key="entry.id" class="activity-card" :class="activityClass(entry.type)">
        <header class="activity-card-header">
          <span class="activity-type">{{ activityIcon(entry.type) }} {{ activityLabel(entry.type) }}</span>
          <span class="activity-wa">{{ entry.waId }}</span>
          <span class="activity-time">{{ formatTime(entry.at) }}</span>
        </header>

        <p v-if="entry.type === 'buffer'" class="activity-text">
          "{{ entry.text }}" <span class="activity-hint">(burbuja #{{ entry.bufferSize }}, esperando {{ entry.waitMs / 1000 }}s de silencio)</span>
        </p>
        <p v-else-if="entry.type === 'llm_request'" class="activity-text">
          <span class="activity-hint">Prompt enviado a {{ entry.model }} ({{ entry.host }}):</span><br />
          "{{ entry.prompt }}"
        </p>
        <p v-else-if="entry.type === 'llm_response'" class="activity-text">
          "{{ entry.text }}"
          <span class="activity-hint">
            (fuente: {{ entry.source === 'llm' ? 'Ollama Cloud LLM' : 'respaldo fijo' }}, {{ entry.latencyMs }}ms)
          </span>
        </p>
        <p v-else-if="entry.type === 'send_success'" class="activity-text">"{{ entry.text }}"</p>
        <p v-else-if="entry.type === 'send_failed'" class="activity-text">
          "{{ entry.text }}"<br />
          <span class="activity-error">❌ {{ entry.error }}</span>
        </p>
        <p v-else-if="entry.type === 'conversation_turn_failed'" class="activity-text">
          <span class="activity-error">❌ {{ entry.error }}</span>
        </p>
        <p v-else-if="entry.type === 'scheduling_offer_skipped'" class="activity-text">
          <span class="activity-error">🚫 {{ entry.reason }}</span>
        </p>
        <p v-else-if="entry.type === 'skipped'" class="activity-text">
          "{{ entry.text }}"<br />
          <span class="activity-error">🚫 {{ entry.reason }}</span>
        </p>
        <p v-else-if="entry.type === 'scheduling_aside'" class="activity-text">
          "{{ entry.text }}"<br />
          <span class="activity-hint">
            Paso: {{ entry.status }} · ¿trae el dato del paso?: {{ entry.answersStep ? 'sí' : 'no' }} ·
            ¿pregunta aparte?: {{ entry.isAside ? 'sí' : 'no' }}
          </span>
          <template v-if="entry.answer"><br />💬 "{{ entry.answer }}"</template>
        </p>
        <p v-else-if="entry.type === 'scheduling_aside_failed'" class="activity-text">
          "{{ entry.text }}"<br />
          <span class="activity-error">⚠️ {{ entry.error }} — el paso siguió su curso normal.</span>
        </p>
        <p v-else-if="entry.type === 'scheduling_fast_track'" class="activity-text activity-hint">
          "{{ entry.text }}"<br />
          Pidió agendar, así que se pasa directo a proponer la reunión sin seguir preguntando datos.
          <template v-if="entry.when"><br />🕐 Momento que indicó: "{{ entry.when }}"</template>
        </p>
        <p v-else-if="entry.type === 'preferred_when_captured'" class="activity-text activity-hint">
          Dijo "{{ entry.when }}" en el paso <strong>{{ entry.status }}</strong>. Se guarda para no volver a
          preguntarle el día cuando toque elegir horario.
        </p>
        <p v-else-if="entry.type === 'preferred_when_failed'" class="activity-text">
          <span class="activity-error">⚠️ No se pudo interpretar "{{ entry.when }}": {{ entry.error }}. Se le preguntó el día igual.</span>
        </p>
        <p v-else-if="entry.type === 'turn_superseded'" class="activity-text activity-hint">
          El contacto siguió escribiendo mientras se preparaba esta respuesta, así que no se envió:
          "{{ entry.reply }}". Responde el turno siguiente, ya con todo lo que escribió.
        </p>
        <p v-else-if="entry.type === 'reset'" class="activity-text activity-hint">
          El estado del bot para este contacto se borró; su próximo mensaje se procesará como si fuera nuevo.
        </p>
      </article>
    </section>

    <!-- Bandeja de conversaciones -->
    <h3 class="subsection-title">Conversaciones</h3>
    <section v-if="!isLoading && conversations.length === 0" class="empty-state">
      <div class="empty-state-visual">
        <img src="/images/empty_chat_state.jpg" alt="WhatsApp Inbox" class="empty-state-photo" />
      </div>
      <h4 class="empty-title">Aún no se han recibido conversaciones</h4>
      <p class="empty-subtitle">Envía un mensaje de prueba al número de WhatsApp Business conectado o usa el simulador de mensajes para interactuar con Avan.</p>
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
            <span class="bot-status-spacer"></span>
            <span v-if="botSession" class="bot-status" :title="botStatusHint">
              {{ botStatusIcon }} {{ botStatusLabel }}
            </span>
            <button type="button" class="btn-bot-toggle" @click="toggleBot">
              {{ botSession?.bot_enabled ? '⏸️ Pausar bot' : '▶️ Activar bot' }}
            </button>
            <button type="button" class="btn-bot-toggle btn-bot-reset" @click="resetBotSession" title="Borra el estado del bot para este contacto: su próximo mensaje se procesará como si fuera nuevo.">
              🔄 Reiniciar conversación
            </button>
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
          <div class="thread-placeholder-card">
            <img src="/images/empty_chat_state.jpg" alt="Chat" class="thread-placeholder-img" />
            <h4 class="thread-placeholder-title">Bandeja de Conversación</h4>
            <p class="thread-placeholder-desc">Selecciona un contacto del panel izquierdo para ver los mensajes en vivo o continuar la atención personalizada.</p>
          </div>
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
const resetMessage = ref('');
const autoRefresh = ref(true);
const hostHint = window.location.host;

const selectedWaId = ref(null);
const thread = ref([]);
const replyText = ref('');
const isSending = ref(false);
const threadScrollEl = ref(null);
const botSession = ref(null);

const configStatus = ref(null);
const botActivity = ref([]);
const simWaId = ref(`test-${Math.floor(100000 + Math.random() * 900000)}`);
const simText = ref('');
const isSimulating = ref(false);
const simMessagesSent = ref([]);

let pollHandle = null;

const allWhatsappConfigOk = computed(() => {
  if (!configStatus.value) return false;
  const w = configStatus.value.whatsapp;
  return w.hasPhoneNumberId && w.hasAccessToken && w.hasAppSecret;
});

const ACTIVITY_META = {
  buffer: { icon: '📥', label: 'Mensaje agrupado', className: 'activity-buffer' },
  llm_request: { icon: '🧠', label: 'Petición al LLM', className: 'activity-llm' },
  llm_response: { icon: '💬', label: 'Respuesta del LLM', className: 'activity-llm' },
  send_success: { icon: '✅', label: 'Enviado por WhatsApp', className: 'activity-ok' },
  send_failed: { icon: '❌', label: 'Falló el envío por WhatsApp', className: 'activity-error-card' },
  conversation_turn_failed: { icon: '⚠️', label: 'Error en el turno de conversación', className: 'activity-error-card' },
  scheduling_offer_skipped: { icon: '📅', label: 'No se ofreció agendar', className: 'activity-error-card' },
  skipped: { icon: '🚫', label: 'El bot ignoró el mensaje', className: 'activity-error-card' },
  reset: { icon: '🔄', label: 'Conversación reiniciada', className: 'activity-ok' },
  scheduling_aside: { icon: '🙋', label: 'Pregunta durante el agendamiento', className: 'activity-llm' },
  scheduling_aside_failed: { icon: '⚠️', label: 'No se pudo revisar si había una pregunta', className: 'activity-error-card' },
  turn_superseded: { icon: '⏭️', label: 'Turno descartado (siguió escribiendo)', className: 'activity-buffer' },
  scheduling_fast_track: { icon: '⚡', label: 'Pidió agendar: se salta a la reunión', className: 'activity-ok' },
  preferred_when_failed: { icon: '⚠️', label: 'No se pudo interpretar el día/hora que pidió', className: 'activity-error-card' },
  preferred_when_captured: { icon: '🕐', label: 'Anotado el día/hora que pidió', className: 'activity-ok' }
};

function activityIcon(type) {
  return ACTIVITY_META[type]?.icon || '•';
}

function activityLabel(type) {
  return ACTIVITY_META[type]?.label || type;
}

function activityClass(type) {
  return ACTIVITY_META[type]?.className || '';
}

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

const SCHEDULING_STATUSES = new Set(['scheduling_date', 'scheduling_time']);

const botStatusIcon = computed(() => {
  if (!botSession.value) return '';
  if (botSession.value.status === 'completed') return '✅';
  if (SCHEDULING_STATUSES.has(botSession.value.status)) return '📅';
  return botSession.value.bot_enabled ? '🤖' : '⏸️';
});

const botStatusLabel = computed(() => {
  if (!botSession.value) return '';
  if (botSession.value.status === 'completed') return 'Avan completado';
  if (!botSession.value.bot_enabled) return 'Bot pausado';
  if (botSession.value.status === 'scheduling_date') return 'Avan: preguntando qué día prefiere';
  if (botSession.value.status === 'scheduling_time') return 'Avan: eligiendo horario de llamada';
  return 'Avan: conversando';
});

const botStatusHint = computed(() => {
  if (!botSession.value) return '';
  if (botSession.value.status === 'completed') return 'El contacto ya completó la conversación con Avan y se registró como lead.';
  if (SCHEDULING_STATUSES.has(botSession.value.status)) return 'Avan ya evaluó el tema y está coordinando el horario de la llamada con el contacto.';
  return 'Avan está conversando automáticamente con este contacto.';
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

async function fetchBotSession(waId) {
  try {
    const response = await apiFetch(`/api/whatsapp/conversations/${encodeURIComponent(waId)}/bot`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener el estado del bot.');
    botSession.value = data.session;
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function toggleBot() {
  if (!selectedWaId.value) return;
  const nextEnabled = !(botSession.value?.bot_enabled ?? false);
  try {
    const response = await apiFetch(`/api/whatsapp/conversations/${encodeURIComponent(selectedWaId.value)}/bot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado del bot.');
    botSession.value = data.session;
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function resetBotSession() {
  if (!selectedWaId.value) return;
  errorMessage.value = '';
  resetMessage.value = '';
  try {
    const response = await apiFetch(`/api/whatsapp/conversations/${encodeURIComponent(selectedWaId.value)}/bot/reset`, {
      method: 'POST'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo reiniciar la conversación.');
    await Promise.all([fetchBotSession(selectedWaId.value), fetchBotActivity()]);
    resetMessage.value = `Conversación con ${selectedWaId.value} reiniciada: su próximo mensaje se procesará como si fuera nuevo.`;
    setTimeout(() => { resetMessage.value = ''; }, 4000);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function selectConversation(waId) {
  if (!waId) return;
  selectedWaId.value = waId;
  fetchThread(waId, { scrollToBottom: true });
  fetchBotSession(waId);
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
    await Promise.all([
      fetchThread(selectedWaId.value, { scrollToBottom: true }),
      fetchConversations(),
      fetchBotSession(selectedWaId.value)
    ]);
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

async function fetchConfigStatus() {
  try {
    const response = await apiFetch('/api/whatsapp/config-status');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener el estado de configuración.');
    configStatus.value = data;
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function fetchBotActivity() {
  try {
    const response = await apiFetch('/api/whatsapp/bot-activity');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener la actividad del bot.');
    botActivity.value = data.activity || [];
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function clearActivity() {
  try {
    const response = await apiFetch('/api/whatsapp/bot-activity', { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo limpiar la bitácora.');
    botActivity.value = [];
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function resetSimWaId() {
  simWaId.value = `test-${Math.floor(100000 + Math.random() * 900000)}`;
  simMessagesSent.value = [];
}

async function sendSimulatedMessage() {
  const waId = simWaId.value.trim();
  const text = simText.value.trim();
  if (!waId || !text) return;

  isSimulating.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-test/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waId, text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo simular el mensaje.');
    simMessagesSent.value.push(text);
    simText.value = '';
    await fetchBotActivity();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSimulating.value = false;
  }
}

async function fetchAll() {
  isLoading.value = true;
  errorMessage.value = '';
  const tasks = [fetchConversations(), fetchStats(), fetchRawEvents(), fetchConfigStatus(), fetchBotActivity()];
  if (selectedWaId.value) tasks.push(fetchThread(selectedWaId.value), fetchBotSession(selectedWaId.value));
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
  background: var(--surface-2);
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
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.success-box {
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
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
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.1rem 1.25rem;
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-sm);
  gap: 0.85rem;
}

.stat-icon-wrapper {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  font-size: 1.75rem;
  font-weight: 800;
  font-family: var(--font-heading);
  letter-spacing: -0.01em;
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
  background: rgba(111, 129, 37, 0.12);
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
  color: #6FA3D8;
}

.channel-ig {
  background: rgba(225, 48, 108, 0.15);
  color: #f0578a;
}

.channel-direct {
  background: var(--surface-2);
  color: var(--text-sub);
}

.channel-ad {
  background: rgba(201, 146, 46, 0.15);
  color: #E0A362;
}

.origin-banner {
  background: rgba(201, 146, 46, 0.1);
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
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.bot-status-spacer {
  flex: 1;
}

.bot-status {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-cyan);
  background: rgba(76, 134, 255, 0.12);
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  white-space: nowrap;
}

.btn-bot-toggle {
  background: var(--surface-2);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-bot-toggle:hover {
  background: var(--surface-3);
}

.btn-bot-reset {
  border-color: rgba(111, 129, 37, 0.4);
  color: #B3CC66;
}

.btn-bot-reset:hover {
  background: rgba(111, 129, 37, 0.12);
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
  background: var(--surface-2);
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
  color: #E0A362;
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
  background: var(--surface-2);
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
  padding: 2rem 1.5rem;
  background: var(--surface-1);
}

.thread-placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 380px;
}

.thread-placeholder-img {
  width: 170px;
  height: 125px;
  border-radius: var(--radius-lg);
  object-fit: cover;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  margin-bottom: 1.25rem;
}

.thread-placeholder-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-main);
  margin-bottom: 0.4rem;
}

.thread-placeholder-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
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
  background: var(--surface-2);
  color: var(--text-sub);
}

.badge-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #5FBE79;
}

.badge-error {
  background: rgba(239, 68, 68, 0.15);
  color: #E0717C;
}

.event-payload {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  color: var(--text-sub);
  overflow-x: auto;
  white-space: pre;
  font-family: var(--font-mono);
  margin: 0;
}

/* Config status banner */
.config-status-banner {
  background: rgba(200, 85, 50, 0.08);
  border: 1px solid rgba(200, 85, 50, 0.3);
  border-radius: 14px;
  padding: 1rem 1.1rem;
}

.config-status-banner.is-ok {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.3);
}

.config-status-banner h4 {
  font-size: 0.9rem;
  margin-bottom: 0.6rem;
  color: var(--text-main);
}

.config-status-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
}

.config-status-list li.ok {
  color: var(--accent-emerald);
}

.config-status-list li.missing {
  color: #E0717C;
}

.config-status-hint {
  color: var(--text-sub);
  font-size: 0.78rem;
}

.config-status-note {
  margin-top: 0.7rem;
  font-size: 0.82rem;
  color: var(--text-sub);
}

/* Simulator */
.simulator-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.simulator-form {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.simulator-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 160px;
}

.simulator-field-grow {
  flex: 1;
}

.form-input-sm {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: 0.85rem;
}

.form-input-sm:focus {
  outline: none;
  border-color: var(--primary);
}

.simulator-history {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sim-message-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.sim-message-chip {
  background: rgba(76, 134, 255, 0.12);
  border: 1px solid rgba(76, 134, 255, 0.3);
  color: var(--accent-cyan);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.75rem;
}

/* Activity feed */
.btn-clear-activity {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-sub);
  border-radius: 8px;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  cursor: pointer;
  margin-left: 0.75rem;
  vertical-align: middle;
}

.btn-clear-activity:hover {
  color: var(--text-main);
  background: var(--surface-2);
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.activity-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--border-color);
  border-radius: 12px;
  padding: 0.75rem 1rem;
}

.activity-card.activity-buffer {
  border-left-color: var(--accent-amber);
}

.activity-card.activity-llm {
  border-left-color: #6F8125;
}

.activity-card.activity-ok {
  border-left-color: var(--accent-emerald);
}

.activity-card.activity-error-card {
  border-left-color: var(--accent-rose);
}

.activity-card-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  margin-bottom: 0.4rem;
}

.activity-type {
  font-weight: 700;
  color: var(--text-main);
}

.activity-wa {
  color: var(--accent-cyan);
  font-family: var(--font-mono);
}

.activity-time {
  margin-left: auto;
  color: var(--text-sub);
  font-size: 0.72rem;
}

.activity-text {
  font-size: 0.82rem;
  color: var(--text-sub);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.activity-hint {
  font-size: 0.72rem;
  opacity: 0.75;
}

.activity-error {
  color: #E0717C;
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
