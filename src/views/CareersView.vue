<template>
  <main class="container-fluid cr-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Configuración</span>
        <h2 class="section-heading"><span class="heading-icon">🎓</span> Carreras</h2>
        <p class="section-subheading cr-subheading">
          Esta lista es la que aparece en el desplegable "Carrera" de leads, proyectos, contratos y del
          evaluador público de tesis. Lo que se agregue acá queda disponible al instante, sin desplegar nada.
        </p>
      </div>
      <div class="page-header-actions">
        <div class="cr-search">
          <span class="cr-search-icon">🔍</span>
          <input
            v-model="search"
            type="text"
            class="cr-search-input"
            placeholder="Buscar carrera en todas las áreas"
          />
          <button v-if="search" type="button" class="cr-search-clear" @click="search = ''">✕</button>
        </div>
      </div>
    </header>

    <p v-if="error" class="info-box cr-alert">⚠️ {{ error }}</p>
    <p v-if="flash" class="info-box cr-flash">✔️ {{ flash }}</p>

    <section class="cr-layout">
      <!-- ===================== Áreas ===================== -->
      <aside class="cr-rail">
        <div class="cr-rail-head">
          <h3 class="cr-rail-title">Áreas <span class="cr-count-badge">{{ groups.length }}</span></h3>
          <p class="cr-rail-note">Arrastra una carrera sobre un área para moverla.</p>
        </div>

        <ul class="cr-rail-list">
          <li
            v-for="(group, index) in groups"
            :key="group.id"
            class="cr-rail-item"
            :class="{
              'is-active': group.id === selectedGroupId && !isSearching,
              'is-drop-target': dropTargetGroupId === group.id
            }"
            @dragover.prevent="onGroupDragOver(group)"
            @dragleave="onGroupDragLeave(group)"
            @drop="onGroupDrop(group)"
          >
            <button type="button" class="cr-rail-btn" @click="selectGroup(group.id)">
              <span class="cr-rail-label">{{ group.label }}</span>
              <span class="cr-rail-count">{{ group.careers.length }}</span>
            </button>
            <div class="cr-rail-actions">
              <button
                type="button"
                class="cr-icon-btn"
                title="Subir el área"
                :disabled="index === 0 || isBusy"
                @click="moveGroup(index, -1)"
              >↑</button>
              <button
                type="button"
                class="cr-icon-btn"
                title="Bajar el área"
                :disabled="index === groups.length - 1 || isBusy"
                @click="moveGroup(index, 1)"
              >↓</button>
              <button type="button" class="cr-icon-btn" title="Renombrar el área" @click="promptRenameGroup(group)">✏️</button>
              <button type="button" class="cr-icon-btn is-danger" title="Eliminar el área" @click="removeGroup(group)">🗑️</button>
            </div>
          </li>
        </ul>

        <form class="cr-rail-add" @submit.prevent="createGroup">
          <input v-model="newGroupLabel" type="text" class="form-input cr-mini-input" placeholder="Nueva área" />
          <button type="submit" class="btn-secondary cr-mini-btn" :disabled="!newGroupLabel.trim() || isBusy">+</button>
        </form>
      </aside>

      <!-- ===================== Carreras ===================== -->
      <section class="cr-panel">
        <div v-if="isSearching" class="cr-panel-head">
          <div>
            <h3 class="cr-panel-title">Resultados</h3>
            <p class="cr-panel-note">
              {{ searchResults.length }} carrera(s) con "{{ search.trim() }}"
            </p>
          </div>
          <button type="button" class="btn-secondary cr-mini-btn" @click="search = ''">Ver por área</button>
        </div>

        <div v-else-if="selectedGroup" class="cr-panel-head">
          <div>
            <h3 class="cr-panel-title">{{ selectedGroup.label }}</h3>
            <p class="cr-panel-note">
              {{ selectedGroup.careers.length }} carrera(s) ·
              {{ activeCount(selectedGroup) }} visibles en el desplegable
            </p>
          </div>
        </div>

        <form v-if="selectedGroup && !isSearching" class="cr-add-form" @submit.prevent="createCareer">
          <input
            v-model="newCareerName"
            type="text"
            class="form-input cr-add-input"
            :placeholder="`Agregar carrera a ${selectedGroup.label}`"
          />
          <button type="submit" class="btn-primary cr-add-btn" :disabled="!newCareerName.trim() || isBusy">
            + Agregar
          </button>
        </form>

        <p v-if="isLoading" class="cr-panel-note">Cargando el catálogo…</p>

        <div v-else-if="visibleCareers.length === 0" class="empty-state cr-empty">
          <p class="empty-state-title">{{ isSearching ? 'Sin coincidencias' : 'Esta área no tiene carreras' }}</p>
          <p class="empty-state-text">
            {{ isSearching
              ? 'Prueba con otro nombre; si no existe, agrégala en el área que le corresponda.'
              : 'Escribe el nombre arriba para agregar la primera.' }}
          </p>
        </div>

        <ul v-else class="cr-list">
          <li
            v-for="(career, index) in visibleCareers"
            :key="career.id"
            class="cr-row"
            :class="{ 'is-inactive': !career.active, 'is-dragging': draggedCareer?.id === career.id }"
            :draggable="!isSearching"
            @dragstart="onCareerDragStart(career, $event)"
            @dragend="onCareerDragEnd"
            @dragover.prevent="onCareerDragOver(index)"
            @drop="onCareerDrop"
          >
            <span v-if="!isSearching" class="cr-grip" title="Arrastra para reordenar o para moverla de área">⠿</span>

            <span class="cr-name">
              {{ career.name }}
              <span v-if="isSearching" class="cr-row-group">{{ groupLabelOf(career) }}</span>
            </span>

            <span class="cr-usage" :title="`${career.usage} lead(s) y proyecto(s) con esta carrera`">
              {{ career.usage || 0 }} en uso
            </span>

            <button
              type="button"
              class="cr-toggle"
              :class="{ 'is-on': career.active }"
              :title="career.active ? 'Se está ofreciendo en el desplegable' : 'Oculta en el desplegable'"
              :disabled="isBusy"
              @click="toggleActive(career)"
            >
              {{ career.active ? 'Visible' : 'Oculta' }}
            </button>

            <div class="cr-row-actions">
              <button type="button" class="cr-icon-btn" title="Editar" @click="openEditor(career)">✏️</button>
              <button type="button" class="cr-icon-btn is-danger" title="Eliminar" @click="removeCareer(career)">🗑️</button>
            </div>
          </li>
        </ul>

        <p v-if="!isSearching && visibleCareers.length > 1" class="cr-hint">
          El orden de esta lista es el orden del desplegable: arrástralas para acomodarlas.
        </p>
      </section>
    </section>

    <!-- ===================== Modal: editar carrera ===================== -->
    <div v-if="editing" class="modal-overlay" @click.self="editing = null">
      <div class="modal-content cr-modal">
        <div class="modal-header">
          <h3 class="cr-modal-title">✏️ Editar carrera</h3>
          <button type="button" class="btn-secondary cr-close-btn" @click="editing = null">✕ Cerrar</button>
        </div>
        <form class="modal-body" @submit.prevent="saveEditor">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input v-model="editForm.name" type="text" class="form-input" required autofocus />
          </div>
          <div class="form-group">
            <label class="form-label">Área</label>
            <select v-model="editForm.groupId" class="form-select">
              <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.label }}</option>
            </select>
          </div>

          <label v-if="editing.usage > 0" class="cr-check">
            <input v-model="editForm.propagate" type="checkbox" />
            <span>
              Renombrar también en los {{ editing.usage }} lead(s)/proyecto(s) que la usan.
              <em>Las cotizaciones y contratos ya emitidos no se tocan.</em>
            </span>
          </label>

          <p v-if="editError" class="cr-form-error">{{ editError }}</p>
          <div class="cr-modal-actions">
            <button type="button" class="btn-secondary" @click="editing = null">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="isBusy">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
/**
 * Administración del catálogo de carreras (`/admin/carreras`).
 *
 * Reemplaza el trabajo que antes era editar `src/data/careers.js` y desplegar:
 * el equipo agrega, renombra, reordena, mueve de área y oculta carreras desde
 * acá. Cada cambio recarga el catálogo compartido (`loadCareerCatalog`) para
 * que los desplegables del resto del panel lo reflejen sin recargar la página.
 *
 * "Oculta" (is_active) existe porque borrar es más agresivo de lo que parece:
 * los leads y proyectos guardan la carrera como texto, así que la ficha vieja
 * sigue mostrándola, pero nadie sabría por qué desapareció de la lista.
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../apiClient.js';
import { loadCareerCatalog } from '../data/careers.js';

const groups = ref([]);
const selectedGroupId = ref(null);
const search = ref('');
const isLoading = ref(true);
const isBusy = ref(false);
const error = ref('');
const flash = ref('');

const newGroupLabel = ref('');
const newCareerName = ref('');

const editing = ref(null);
const editForm = reactive({ name: '', groupId: null, propagate: true });
const editError = ref('');

const draggedCareer = ref(null);
const dropTargetGroupId = ref(null);

const isSearching = computed(() => search.value.trim().length > 0);

const selectedGroup = computed(
  () => groups.value.find((group) => group.id === selectedGroupId.value) || groups.value[0] || null
);

const searchResults = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return [];
  return groups.value.flatMap((group) =>
    group.careers
      .filter((career) => career.name.toLowerCase().includes(term))
      .map((career) => ({ ...career, groupId: group.id }))
  );
});

const visibleCareers = computed(() =>
  isSearching.value ? searchResults.value : selectedGroup.value?.careers || []
);

function activeCount(group) {
  return group.careers.filter((career) => career.active).length;
}

function groupLabelOf(career) {
  return groups.value.find((group) => group.id === career.groupId)?.label || '';
}

function selectGroup(id) {
  selectedGroupId.value = id;
  newCareerName.value = '';
}

function notify(message) {
  flash.value = message;
  error.value = '';
  setTimeout(() => {
    if (flash.value === message) flash.value = '';
  }, 4000);
}

/**
 * Toda escritura pasa por acá: deja el mensaje de error del backend a la vista
 * (son mensajes pensados para leerse, p. ej. "X ya está en el catálogo") y
 * vuelve a cargar el catálogo local y el compartido.
 */
async function send(method, url, body) {
  isBusy.value = true;
  try {
    const response = await apiFetch(url, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el cambio.');
    return data;
  } finally {
    isBusy.value = false;
  }
}

async function fetchCatalog() {
  try {
    const response = await apiFetch('/api/careers/manage');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el catálogo.');
    groups.value = data.groups || [];
    if (!groups.value.some((group) => group.id === selectedGroupId.value)) {
      selectedGroupId.value = groups.value[0]?.id ?? null;
    }
    error.value = '';
  } catch (err) {
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

/** Recarga la pantalla y el catálogo que usan los desplegables del panel. */
async function refreshAll() {
  await Promise.all([fetchCatalog(), loadCareerCatalog({ force: true })]);
}

async function run(action, successMessage) {
  try {
    const result = await action();
    await refreshAll();
    if (successMessage) notify(typeof successMessage === 'function' ? successMessage(result) : successMessage);
    return result;
  } catch (err) {
    error.value = err.message;
    flash.value = '';
    return null;
  }
}

/* ---------- áreas ---------- */
async function createGroup() {
  const label = newGroupLabel.value.trim();
  if (!label) return;
  const result = await run(() => send('POST', '/api/careers/groups', { label }), `Área "${label}" creada.`);
  if (result) {
    newGroupLabel.value = '';
    selectedGroupId.value = result.group?.id ?? selectedGroupId.value;
  }
}

async function promptRenameGroup(group) {
  const label = window.prompt('Nuevo nombre del área:', group.label);
  if (label === null || label.trim() === group.label) return;
  await run(() => send('PUT', `/api/careers/groups/${group.id}`, { label }), 'Área renombrada.');
}

async function removeGroup(group) {
  if (group.careers.length > 0) {
    error.value = `"${group.label}" todavía tiene ${group.careers.length} carrera(s). Muévelas o elimínalas antes de borrar el área.`;
    return;
  }
  if (!confirm(`¿Eliminar el área "${group.label}"?`)) return;
  await run(() => send('DELETE', `/api/careers/groups/${group.id}`), 'Área eliminada.');
}

async function moveGroup(index, offset) {
  const ids = groups.value.map((group) => group.id);
  const target = index + offset;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await run(() => send('PATCH', '/api/careers/groups/reorder', { ids }));
}

/* ---------- carreras ---------- */
async function createCareer() {
  const name = newCareerName.value.trim();
  if (!name || !selectedGroup.value) return;
  const result = await run(
    () => send('POST', '/api/careers', { groupId: selectedGroup.value.id, name }),
    `"${name}" ya está disponible en el desplegable.`
  );
  if (result) newCareerName.value = '';
}

function openEditor(career) {
  editing.value = { ...career, groupId: career.groupId ?? selectedGroup.value?.id };
  editForm.name = career.name;
  editForm.groupId = editing.value.groupId;
  editForm.propagate = true;
  editError.value = '';
}

async function saveEditor() {
  const name = editForm.name.trim();
  if (!name) {
    editError.value = 'El nombre es obligatorio.';
    return;
  }
  try {
    const data = await send('PUT', `/api/careers/${editing.value.id}`, {
      name,
      groupId: editForm.groupId,
      propagate: editForm.propagate
    });
    editing.value = null;
    await refreshAll();
    notify(
      data.renamedRows > 0
        ? `Carrera actualizada y renombrada en ${data.renamedRows} ficha(s).`
        : 'Carrera actualizada.'
    );
  } catch (err) {
    editError.value = err.message;
  }
}

async function toggleActive(career) {
  await run(
    () => send('PUT', `/api/careers/${career.id}`, { active: !career.active }),
    career.active ? `"${career.name}" ya no se ofrece en el desplegable.` : `"${career.name}" vuelve al desplegable.`
  );
}

async function removeCareer(career) {
  const usageNote = career.usage > 0
    ? `\n\n${career.usage} ficha(s) la tienen registrada: conservan el nombre, pero ya no podrá elegirse. Si solo quieres dejar de ofrecerla, usa "Visible".`
    : '';
  if (!confirm(`¿Eliminar "${career.name}" del catálogo?${usageNote}`)) return;
  await run(() => send('DELETE', `/api/careers/${career.id}`), `"${career.name}" eliminada del catálogo.`);
}

/* ---------- arrastrar y soltar ---------- */
function onCareerDragStart(career, event) {
  if (isSearching.value) return;
  draggedCareer.value = { ...career, groupId: selectedGroup.value?.id };
  // Sin datos en el `dataTransfer` Firefox no llega a iniciar el arrastre.
  event?.dataTransfer?.setData('text/plain', career.name);
}

function onCareerDragEnd() {
  draggedCareer.value = null;
  dropTargetGroupId.value = null;
}

/**
 * Reordenar mientras se arrastra: la lista se reacomoda en pantalla y el orden
 * definitivo se manda al soltar, no en cada `dragover`.
 */
function onCareerDragOver(index) {
  const dragged = draggedCareer.value;
  const list = selectedGroup.value?.careers;
  if (!dragged || !list) return;
  const from = list.findIndex((career) => career.id === dragged.id);
  if (from === -1 || from === index) return;
  const [moved] = list.splice(from, 1);
  list.splice(index, 0, moved);
}

async function onCareerDrop() {
  const group = selectedGroup.value;
  if (!draggedCareer.value || !group) return;
  const ids = group.careers.map((career) => career.id);
  draggedCareer.value = null;
  await run(() => send('PATCH', '/api/careers/reorder', { groupId: group.id, ids }));
}

function onGroupDragOver(group) {
  if (draggedCareer.value && group.id !== draggedCareer.value.groupId) {
    dropTargetGroupId.value = group.id;
  }
}

function onGroupDragLeave(group) {
  if (dropTargetGroupId.value === group.id) dropTargetGroupId.value = null;
}

async function onGroupDrop(group) {
  const career = draggedCareer.value;
  dropTargetGroupId.value = null;
  if (!career || group.id === career.groupId) return;
  draggedCareer.value = null;
  await run(
    () => send('PUT', `/api/careers/${career.id}`, { groupId: group.id }),
    `"${career.name}" movida a ${group.label}.`
  );
}

onMounted(fetchCatalog);
</script>

<style scoped>
.cr-page {
  padding: var(--page-py) var(--page-px) var(--page-pb);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  box-sizing: border-box;
}

.cr-subheading {
  max-width: 680px;
  margin-bottom: 0;
}

.cr-alert {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.cr-flash {
  border-color: rgba(60, 160, 120, 0.4);
  color: var(--accent-emerald);
}

/* ---------- búsqueda ---------- */
.cr-search {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 260px;
}

.cr-search-icon {
  position: absolute;
  left: 0.6rem;
  font-size: 0.8rem;
  opacity: 0.6;
}

.cr-search-input {
  width: 100%;
  padding: 0.5rem 1.8rem 0.5rem 1.9rem;
  font-size: 0.85rem;
  color: var(--text-main);
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.cr-search-clear {
  position: absolute;
  right: 0.45rem;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
}

/* ---------- layout ---------- */
.cr-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1.25rem;
  align-items: start;
}

.cr-rail,
.cr-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cr-rail-title,
.cr-panel-title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.cr-rail-note,
.cr-panel-note {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0.25rem 0 0;
}

.cr-count-badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-sub);
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}

.cr-rail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.cr-rail-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  padding: 0.1rem 0.25rem;
}

.cr-rail-item.is-active {
  background: var(--surface-2);
  border-color: var(--border-color);
}

.cr-rail-item.is-drop-target {
  border-color: var(--primary);
  background: rgba(16, 94, 255, 0.08);
}

.cr-rail-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: none;
  border: none;
  padding: 0.4rem 0.35rem;
  font-size: 0.82rem;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
}

.cr-rail-count {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
}

.cr-rail-actions,
.cr-row-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.cr-rail-item:not(:hover):not(.is-active) .cr-rail-actions {
  opacity: 0;
}

.cr-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  color: var(--text-sub);
}

.cr-icon-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.cr-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cr-icon-btn.is-danger:hover {
  color: var(--accent-rose);
}

.cr-rail-add {
  display: flex;
  gap: 0.35rem;
  border-top: 1px solid var(--border-color);
  padding-top: 0.6rem;
}

.cr-mini-input {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.4rem 0.55rem;
}

.cr-mini-btn {
  width: auto;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
}

/* ---------- panel de carreras ---------- */
.cr-panel-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.cr-add-form {
  display: flex;
  gap: 0.4rem;
}

.cr-add-input {
  flex: 1;
  font-size: 0.85rem;
  padding: 0.45rem 0.6rem;
}

.cr-add-btn {
  width: auto;
  padding: 0.45rem 0.9rem;
  font-size: 0.82rem;
}

.cr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.cr-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.cr-row:hover {
  background: var(--surface-2);
}

.cr-row.is-dragging {
  opacity: 0.45;
  border-color: var(--primary);
}

.cr-row.is-inactive .cr-name {
  color: var(--text-muted);
  text-decoration: line-through;
}

.cr-grip {
  cursor: grab;
  color: var(--text-muted);
  font-size: 0.8rem;
  user-select: none;
}

.cr-name {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-main);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.cr-row-group {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.cr-usage {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.cr-toggle {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.cr-toggle.is-on {
  border-color: rgba(60, 160, 120, 0.45);
  color: var(--accent-emerald);
}

.cr-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0;
}

.cr-empty {
  margin: 0;
}

/* ---------- modal ---------- */
.cr-modal {
  max-width: 480px;
}

.cr-modal-title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}

.cr-close-btn {
  width: auto;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
}

.cr-check {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.78rem;
  color: var(--text-sub);
  line-height: 1.45;
}

.cr-check em {
  color: var(--text-muted);
  font-style: normal;
}

.cr-form-error {
  font-size: 0.78rem;
  color: var(--accent-rose);
  margin: 0;
}

.cr-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@media (max-width: 860px) {
  .cr-layout {
    grid-template-columns: 1fr;
  }
  .cr-page {
    padding: 1rem;
  }
}
</style>
