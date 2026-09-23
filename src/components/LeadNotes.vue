<template>
  <section class="lead-notes">
    <header class="lead-notes-head">
      <h4 class="lead-notes-title">🗒️ Notas del seguimiento</h4>
      <span class="lead-notes-count" v-if="notes.length">
        {{ notes.length }} {{ notes.length === 1 ? 'nota' : 'notas' }}
      </span>
    </header>

    <form class="lead-notes-form" @submit.prevent="save">
      <textarea
        v-model="draft"
        class="lead-notes-input"
        :maxlength="MAX_LENGTH"
        rows="3"
        placeholder="¿En qué se quedó con este lead? Ej.: pidió cotización de tesis completa, vuelve a llamar el lunes 10 a.m."
        :disabled="saving"
        @keydown.ctrl.enter.prevent="save"
        @keydown.meta.enter.prevent="save"
      ></textarea>
      <div class="lead-notes-form-foot">
        <span class="lead-notes-hint">
          {{ draft.length }}/{{ MAX_LENGTH }} · Ctrl + Enter para guardar
        </span>
        <button type="submit" class="lead-notes-save" :disabled="saving || !draft.trim()">
          {{ saving ? 'Guardando…' : '＋ Agregar nota' }}
        </button>
      </div>
    </form>

    <p v-if="errorMsg" class="lead-notes-error">⚠️ {{ errorMsg }}</p>

    <p v-if="loading && !notes.length" class="lead-notes-empty">Cargando notas…</p>
    <p v-else-if="!notes.length" class="lead-notes-empty">
      Todavía no hay notas de este lead. La primera que escribas queda con tu nombre y la fecha.
    </p>

    <ul v-else class="lead-notes-list custom-scrollbar">
      <li v-for="note in notes" :key="note.id" class="lead-note">
        <div class="lead-note-meta">
          <span class="lead-note-author">👤 {{ note.authorName }}</span>
          <span class="lead-note-date">{{ formatDateTime(note.createdAt) }}</span>
          <button
            v-if="canDelete(note)"
            type="button"
            class="lead-note-delete"
            title="Borrar esta nota"
            @click="remove(note)"
          >🗑️</button>
        </div>
        <p class="lead-note-body">{{ note.body }}</p>
      </li>
    </ul>
  </section>
</template>

<script setup>
/**
 * Bitácora de observaciones de un lead, compartida por el Setter Funnel y el
 * funnel de ventas: los dos abren la misma ficha y necesitan el mismo panel,
 * así que vive aquí y no duplicado en cada vista.
 *
 * Las notas se acumulan (nunca se sobrescriben) porque lo que hace falta es el
 * historial —qué se habló y cuándo— y no un último estado. Borrar sólo puede
 * quien escribió la nota o alguien con `roles.manage`; el backend lo vuelve a
 * comprobar, aquí sólo se decide si mostrar el botón.
 */
import { ref, watch } from 'vue';
import { apiFetch } from '../apiClient.js';
import { authState, hasPermission } from '../auth.js';

const props = defineProps({
  leadId: { type: [Number, String], required: true }
});

/** Mismo tope que valida el backend (`leadNoteService`). */
const MAX_LENGTH = 2000;

const notes = ref([]);
const draft = ref('');
const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');

async function load() {
  if (!props.leadId) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await apiFetch(`/api/leads/${props.leadId}/notes`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las notas.');
    notes.value = data.notes || [];
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function save() {
  const body = draft.value.trim();
  if (!body || saving.value) return;
  saving.value = true;
  errorMsg.value = '';
  try {
    const res = await apiFetch(`/api/leads/${props.leadId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la nota.');
    // La nota nueva va arriba: la lista está ordenada de la más reciente a la
    // más antigua, igual que la devuelve el backend.
    notes.value = [data.note, ...notes.value];
    draft.value = '';
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(note) {
  if (!window.confirm('¿Borrar esta nota? No se puede deshacer.')) return;
  errorMsg.value = '';
  try {
    const res = await apiFetch(`/api/lead-notes/${note.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo borrar la nota.');
    }
    notes.value = notes.value.filter((n) => n.id !== note.id);
  } catch (err) {
    errorMsg.value = err.message;
  }
}

function canDelete(note) {
  return note.authorId === authState.user?.id || hasPermission('roles.manage');
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// La ficha se reutiliza al abrir otro lead sin desmontar el componente, así
// que hay que recargar cuando cambia el id (y limpiar el borrador a medias,
// que si no se llevaría al lead equivocado).
watch(() => props.leadId, () => {
  draft.value = '';
  notes.value = [];
  load();
}, { immediate: true });
</script>

<style scoped>
.lead-notes {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem;
}

.lead-notes-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.lead-notes-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}

.lead-notes-count {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.lead-notes-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lead-notes-input {
  width: 100%;
  resize: vertical;
  min-height: 62px;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-solid);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.83rem;
  line-height: 1.45;
}

.lead-notes-input:focus {
  outline: none;
  border-color: var(--surface-5);
}

.lead-notes-form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.lead-notes-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.lead-notes-save {
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text-main);
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.lead-notes-save:hover:not(:disabled) {
  background: var(--surface-4);
}

.lead-notes-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lead-notes-error {
  margin: 0;
  font-size: 0.76rem;
  color: var(--accent-rose);
}

.lead-notes-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.lead-notes-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Con muchas notas la ficha no debe crecer sin fin: la bitácora hace scroll
     dentro de su propio panel. */
  max-height: 260px;
  overflow-y: auto;
}

.lead-note {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--surface-5);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
}

.lead-note-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-bottom: 0.3rem;
}

.lead-note-author {
  font-weight: 600;
  color: var(--text-sub);
}

.lead-note-date {
  font-family: var(--font-mono);
}

.lead-note-delete {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  opacity: 0.55;
  padding: 0;
  line-height: 1;
}

.lead-note-delete:hover {
  opacity: 1;
}

.lead-note-body {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
