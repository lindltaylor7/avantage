<template>
  <main class="container-fluid notices-page">
    <div class="page-head">
      <h1 class="page-title">
        <svg class="heading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Avisos al equipo
      </h1>
      <p class="page-sub">
        Lo que escribas acá le llega a la campana del panel y, si tiene la app instalada,
        al teléfono — aunque la tenga cerrada.
      </p>
    </div>

    <div class="notices-grid">
      <!-- ───────────────────────── Escribir el aviso ───────────────────────── -->
      <section class="card compose">
        <h2 class="card-title">Nuevo aviso</h2>

        <label class="field">
          <span class="field-label">Título</span>
          <input
            v-model="form.title"
            type="text"
            class="form-control"
            maxlength="120"
            placeholder="Reunión de equipo a las 5"
            @keydown.enter.prevent="focusBody"
          />
          <!-- El contador sale solo cerca del límite: permanente es ruido en un
               campo que casi nunca se acerca a 120. -->
          <span v-if="form.title.length > 90" class="field-hint">
            {{ 120 - form.title.length }} caracteres restantes
          </span>
        </label>

        <label class="field">
          <span class="field-label">Mensaje <em>(opcional)</em></span>
          <textarea
            ref="bodyInput"
            v-model="form.body"
            class="form-control"
            rows="3"
            maxlength="1000"
            placeholder="En la sala de arriba. Traigan el reporte de la semana."
          ></textarea>
        </label>

        <label class="field">
          <span class="field-label">Llevar a <em>(opcional)</em></span>
          <select v-model="form.link" class="form-control">
            <option value="">No llevar a ninguna pantalla</option>
            <option v-for="d in LINK_DESTINATIONS" :key="d.path" :value="d.path">{{ d.label }}</option>
          </select>
          <span class="field-hint">
            Al tocar el aviso, se abre esa pantalla del panel.
          </span>
        </label>

        <!-- ─────────────────────────── A quién ─────────────────────────── -->
        <div class="field">
          <span class="field-label">¿A quién?</span>

          <label class="choice">
            <input v-model="form.everyone" type="radio" :value="true" />
            <span>
              <strong>A todo el equipo</strong>
              <em>Lo ve cualquiera que entre al panel.</em>
            </span>
          </label>

          <label class="choice">
            <input v-model="form.everyone" type="radio" :value="false" />
            <span>
              <strong>Solo a quien yo elija</strong>
              <em>Nadie más lo ve, ni en la campana ni en el teléfono.</em>
            </span>
          </label>
        </div>

        <div v-if="!form.everyone" class="picker">
          <div v-if="audiences.roles.length > 0" class="picker-block">
            <span class="picker-title">Por rol</span>
            <div class="chips">
              <button
                v-for="rol in audiences.roles"
                :key="'r' + rol.id"
                type="button"
                class="chip"
                :class="{ 'is-on': form.roleIds.includes(rol.id) }"
                :disabled="rol.people === 0"
                :title="rol.people === 0 ? 'Este rol no tiene a nadie' : ''"
                @click="toggle(form.roleIds, rol.id)"
              >
                {{ rol.name }}
                <span class="chip-count">{{ rol.people }}</span>
              </button>
            </div>
          </div>

          <div class="picker-block">
            <span class="picker-title">Por persona</span>
            <div class="chips">
              <button
                v-for="u in audiences.users"
                :key="'u' + u.id"
                type="button"
                class="chip"
                :class="{ 'is-on': form.userIds.includes(u.id) }"
                @click="toggle(form.userIds, u.id)"
              >
                {{ u.name || u.email }}
                <span v-if="u.role_name" class="chip-role">{{ u.role_name }}</span>
              </button>
            </div>
          </div>

          <!-- Cuántos reciben, resuelto en la pantalla con la misma regla que el
               servidor (una persona elegida a dedo y además por su rol es UNA).
               Sin esto, "Setter + Lucía" parece dos avisos para Lucía. -->
          <p class="picker-total" :class="{ 'is-empty': recipientCount === 0 }">
            {{ recipientCount === 0
              ? 'Todavía no elegiste a nadie.'
              : `Le va a llegar a ${recipientCount} ${recipientCount === 1 ? 'persona' : 'personas'}.` }}
          </p>
        </div>

        <p v-if="error" class="alert-error">{{ error }}</p>
        <p v-if="sent" class="alert-ok">{{ sent }}</p>

        <div class="compose-actions">
          <button type="button" class="btn-action-primary" :disabled="!canSend || sending" @click="send">
            {{ sending ? 'Enviando…' : 'Enviar aviso' }}
          </button>
          <button type="button" class="btn-action-ghost" :disabled="sending" @click="reset">
            Limpiar
          </button>
        </div>
      </section>

      <!-- ──────────────────────────── Historial ──────────────────────────── -->
      <section class="card history">
        <h2 class="card-title">
          Enviados
          <button type="button" class="btn-action-ghost btn-mini" @click="loadHistory">Actualizar</button>
        </h2>

        <p v-if="loadingHistory" class="muted">Cargando…</p>
        <p v-else-if="notices.length === 0" class="muted">
          Todavía no se mandó ningún aviso desde acá.
        </p>

        <ul v-else class="notice-list">
          <li v-for="n in notices" :key="n.batch_id" class="notice-row">
            <div class="notice-head">
              <strong class="notice-title">{{ n.title }}</strong>
              <span class="notice-when" :title="fullDate(n.created_at)">{{ relative(n.created_at) }}</span>
            </div>
            <p v-if="n.body" class="notice-body">{{ n.body }}</p>
            <div class="notice-meta">
              <span class="pill pill-neutral">
                {{ n.everyone ? 'Todo el equipo' : `${n.recipients} ${n.recipients === 1 ? 'persona' : 'personas'}` }}
              </span>
              <!-- Para un aviso a todos no se cuenta leído: la campana la ve
                   cualquiera con sesión, así que no hay un conjunto de
                   destinatarios contra el que medirlo. -->
              <span v-if="!n.everyone" class="pill" :class="n.read_count === n.recipients ? 'pill-success' : 'pill-warning'">
                {{ n.read_count }} de {{ n.recipients }} leído{{ n.read_count === 1 ? '' : 's' }}
              </span>
              <span v-if="n.sender_name" class="notice-sender">por {{ n.sender_name }}</span>
            </div>
            <p v-if="!n.everyone && n.recipient_names.length > 0" class="notice-to">
              {{ n.recipient_names.join(' · ') }}
            </p>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

/**
 * A dónde puede llevar un aviso.
 *
 * Es una lista cerrada y no un campo libre a propósito: el servidor ya rechaza
 * cualquier cosa que no sea una ruta del panel —un aviso que manda a un dominio
 * de afuera es la forma exacta de un phishing interno, y el push le llega a todo
 * el equipo con el nombre de la empresa arriba— así que ofrecer un cuadro de
 * texto solo daría la oportunidad de escribir algo que va a ser rechazado.
 */
const LINK_DESTINATIONS = [
  { path: '/admin/dashboard', label: 'Dashboard' },
  { path: '/admin/leads', label: 'Funnel de Ventas' },
  { path: '/admin/setter-funnel', label: 'Setter Funnel' },
  { path: '/admin/calendario', label: 'Calendario' },
  { path: '/admin/entregables', label: 'Entregables' },
  { path: '/admin/proyectos', label: 'Proyectos' },
  { path: '/admin/cobranzas', label: 'Cobranzas' },
  { path: '/admin/finanzas', label: 'Finanzas' }
];

const audiences = ref({ users: [], roles: [] });
const notices = ref([]);
const loadingHistory = ref(true);
const sending = ref(false);
const error = ref('');
const sent = ref('');
const bodyInput = ref(null);

const emptyForm = () => ({ title: '', body: '', link: '', everyone: true, userIds: [], roleIds: [] });
const form = ref(emptyForm());

/**
 * Cuántas personas reciben. Se calcula acá con la MISMA regla del servidor
 * (`NoticeService.resolveRecipients`): quien está elegido a dedo y además por
 * su rol cuenta una vez. Con dos reglas distintas, la pantalla prometería un
 * número y el envío haría otro.
 */
const recipientCount = computed(() => {
  if (form.value.everyone) return 0;
  const ids = new Set(form.value.userIds);
  for (const rol of form.value.roleIds) {
    for (const u of audiences.value.users) {
      if (rolOf(u) === rol) ids.add(u.id);
    }
  }
  return ids.size;
});

function rolOf(user) {
  const rol = audiences.value.roles.find((r) => r.name === user.role_name);
  return rol ? rol.id : null;
}

const canSend = computed(() => {
  if (!form.value.title.trim()) return false;
  return form.value.everyone || recipientCount.value > 0;
});

function toggle(list, id) {
  const i = list.indexOf(id);
  if (i === -1) list.push(id);
  else list.splice(i, 1);
}

function focusBody() {
  bodyInput.value?.focus();
}

function reset() {
  form.value = emptyForm();
  error.value = '';
  sent.value = '';
}

async function loadAudiences() {
  try {
    const r = await apiFetch('/api/notices/audiences');
    if (r.ok) audiences.value = await r.json();
  } catch (e) {
    error.value = 'No se pudo traer la lista de destinatarios.';
  }
}

async function loadHistory() {
  loadingHistory.value = true;
  try {
    const r = await apiFetch('/api/notices');
    if (r.ok) notices.value = (await r.json()).notices || [];
  } catch (e) {
    // Un historial que no carga no impide mandar un aviso.
  } finally {
    loadingHistory.value = false;
  }
}

async function send() {
  sending.value = true;
  error.value = '';
  sent.value = '';
  try {
    const r = await apiFetch('/api/notices', {
      method: 'POST',
      body: JSON.stringify({
        title: form.value.title,
        body: form.value.body,
        link: form.value.link || null,
        everyone: form.value.everyone,
        userIds: form.value.userIds,
        roleIds: form.value.roleIds
      })
    });
    const data = await r.json();
    if (!r.ok) {
      error.value = data.error || 'No se pudo enviar el aviso.';
      return;
    }
    sent.value = data.summary.everyone
      ? 'Enviado a todo el equipo.'
      : `Enviado a ${data.summary.recipients} ${data.summary.recipients === 1 ? 'persona' : 'personas'}.`;
    // Se limpia el aviso pero NO el "a quién": mandar dos avisos seguidos al
    // mismo grupo es el caso normal, y volver a elegir las ocho personas es el
    // trabajo que esta pantalla vino a ahorrar.
    form.value.title = '';
    form.value.body = '';
    form.value.link = '';
    await loadHistory();
  } catch (e) {
    error.value = 'No se pudo enviar el aviso.';
  } finally {
    sending.value = false;
  }
}

const RELATIVE = [
  [60, 'ahora'],
  [3600, (s) => `hace ${Math.floor(s / 60)} min`],
  [86400, (s) => `hace ${Math.floor(s / 3600)} h`],
  [172800, () => 'ayer']
];

/** En lenguaje llano, como las tarjetas de Entregables. */
function relative(iso) {
  if (!iso) return '';
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  for (const [limite, texto] of RELATIVE) {
    if (segundos < limite) return typeof texto === 'function' ? texto(segundos) : texto;
  }
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
}

function fullDate(iso) {
  return iso ? new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '';
}

onMounted(() => {
  loadAudiences();
  loadHistory();
});
</script>

<style scoped>
/* El aire sale de los tokens del panel, no de un padding propio: ver
   "DENSIDAD Y ESTILO DEL PANEL INTERNO" en src/style.css. */
.notices-page {
  padding: var(--page-py) var(--page-px) var(--page-pb);
}

.page-head { margin-bottom: 1rem; }
.page-sub {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0.25rem 0 0;
  max-width: 60ch;
}

.notices-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1100px) {
  .notices-grid { grid-template-columns: minmax(0, 1fr); }
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
}
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0 0 0.85rem;
}

.field { display: block; margin-bottom: 0.85rem; }
.field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-sub);
  margin-bottom: 0.3rem;
}
.field-label em { font-weight: 400; color: var(--text-muted); font-style: normal; }
.field-hint {
  display: block;
  font-size: 0.74rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  cursor: pointer;
  margin-bottom: 0.4rem;
}
.choice:hover { background: var(--bg-card-hover); }
.choice input { margin-top: 0.2rem; }
.choice strong { display: block; font-size: 0.85rem; }
.choice em {
  display: block;
  font-style: normal;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.picker {
  border: 1px dashed var(--border-color);
  border-radius: 9px;
  padding: 0.7rem;
  margin-bottom: 0.85rem;
}
.picker-block + .picker-block { margin-top: 0.7rem; }
.picker-title {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 0.35rem;
}
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.6rem;
  font-size: 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-main);
  cursor: pointer;
}
.chip:hover:not(:disabled) { border-color: var(--border-strong); }
.chip:disabled { opacity: 0.45; cursor: not-allowed; }
.chip.is-on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.chip-count,
.chip-role {
  font-size: 0.7rem;
  opacity: 0.75;
}
.picker-total {
  font-size: 0.78rem;
  font-weight: 600;
  margin: 0.6rem 0 0;
  color: var(--primary);
}
.picker-total.is-empty { color: var(--text-muted); font-weight: 400; }

.compose-actions { display: flex; gap: 0.5rem; }

.alert-error,
.alert-ok {
  font-size: 0.8rem;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  margin: 0 0 0.7rem;
}
.alert-error {
  color: var(--accent-rose);
  background: color-mix(in srgb, var(--accent-rose) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-rose) 30%, transparent);
}
.alert-ok {
  color: var(--accent-emerald);
  background: color-mix(in srgb, var(--accent-emerald) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-emerald) 30%, transparent);
}

.muted { color: var(--text-muted); font-size: 0.83rem; }
.btn-mini { font-size: 0.75rem; padding: 0.2rem 0.5rem; }

.notice-list { list-style: none; margin: 0; padding: 0; }
.notice-row {
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--border-color);
}
.notice-row:last-child { border-bottom: none; }
.notice-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}
.notice-title { font-size: 0.88rem; }
.notice-when {
  font-size: 0.73rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.notice-body {
  font-size: 0.8rem;
  color: var(--text-sub);
  margin: 0.25rem 0 0;
  white-space: pre-wrap;
}
.notice-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.45rem;
}
.notice-sender { font-size: 0.73rem; color: var(--text-muted); }
.notice-to {
  font-size: 0.74rem;
  color: var(--text-muted);
  margin: 0.35rem 0 0;
}
</style>
