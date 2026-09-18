<template>
  <section>
    <p v-if="errorMessage" class="info-box ct-alert">⚠️ {{ errorMessage }}</p>

    <div class="ct-layout">
      <aside class="glass-panel ct-sidebar">
        <div class="ct-list-head">
          <h3 class="ct-panel-title">Tipos de contrato ({{ templates.length }})</h3>
          <button type="button" class="btn-primary ct-full" @click="startNew()">+ Nuevo tipo de contrato</button>
        </div>

        <div v-if="isLoading" class="empty-state"><p>Cargando…</p></div>
        <ul v-else class="ct-list">
          <li v-for="t in templates" :key="t.id">
            <button type="button" class="ct-item" :class="{ 'is-active': editing?.id === t.id }" @click="select(t)">
              <span class="ct-item-client">{{ t.label }}</span>
              <span class="ct-item-number">{{ t.clauses.length }} cláusulas</span>
            </button>
          </li>
        </ul>
      </aside>

      <section v-if="editing" class="glass-panel ct-editor">
        <div class="ct-toolbar">
          <div>
            <span class="ct-item-number">{{ editing.id ? 'Editando tipo de contrato' : 'Nuevo tipo de contrato' }}</span>
            <span v-if="isDirty" class="ct-dirty">● Cambios sin guardar</span>
          </div>
          <div class="ct-actions">
            <button v-if="editing.id" type="button" class="btn-secondary" :disabled="isSaving" @click="duplicate">Duplicar</button>
            <button type="button" class="btn-primary" :disabled="isSaving || !isDirty" @click="save">
              {{ isSaving ? 'Guardando…' : 'Guardar' }}
            </button>
            <button v-if="editing.id" type="button" class="btn-secondary ct-danger" :disabled="isSaving" @click="remove">Eliminar</button>
          </div>
        </div>

        <p class="ct-hint">
          Los cambios aplican a los contratos que se creen desde ahora; los contratos ya creados conservan su propio texto.
        </p>

        <div class="ct-grid">
          <div class="form-group">
            <label class="form-label">Nombre del tipo (lo que se ve al elegirlo)</label>
            <input v-model="editing.label" class="form-input" placeholder="Ej: Contrato de confidencialidad" />
          </div>
          <div class="form-group">
            <label class="form-label">Título en el documento</label>
            <input v-model="editing.title" class="form-input" placeholder="Ej: ACUERDO DE CONFIDENCIALIDAD" />
          </div>
          <div class="form-group ct-wide">
            <label class="form-label">Apertura (comparecencia de las partes)</label>
            <textarea v-model="editing.intro" class="form-textarea" rows="5"></textarea>
          </div>
          <div class="form-group ct-wide">
            <label class="form-label">Cierre</label>
            <textarea v-model="editing.closing" class="form-textarea" rows="3"></textarea>
          </div>
        </div>

        <h3 class="ct-section-title">Cláusulas base ({{ editing.clauses.length }})</h3>
        <ClauseEditor v-model="editing.clauses" />
      </section>

      <section v-else class="glass-panel ct-editor empty-state">
        <p class="empty-state-title">Selecciona o crea un tipo de contrato</p>
        <p class="empty-state-text">Define su título, apertura, cierre y las cláusulas con las que arranca cada contrato.</p>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import ClauseEditor from '../../components/ClauseEditor.vue';
import { request, stripKeys, withKeys } from './contractsApi.js';

const DEFAULT_INTRO =
  'Conste por el presente documento el contrato que celebran, de una parte, {{empresa}}, con RUC N.º {{ruc}}, ' +
  'con domicilio en {{domicilio_empresa}}, debidamente representada por {{representante}}; y, de la otra parte, ' +
  '{{cliente}}, identificado(a) con DNI N.º {{dni}}, con domicilio en {{domicilio}}; en los términos y condiciones siguientes:';
const DEFAULT_CLOSING =
  'Las partes declaran haber leído el presente contrato y lo suscriben en señal de conformidad en la ciudad de {{ciudad}}, el {{fecha}}.';

const templates = ref([]);
const editing = ref(null);
const savedSnapshot = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref('');

const snapshot = (t) => JSON.stringify([t.label, t.title, t.intro ?? '', t.closing ?? '', stripKeys(t.clauses)]);
const isDirty = computed(() => !!editing.value && snapshot(editing.value) !== savedSnapshot.value);

async function run(task) {
  errorMessage.value = '';
  try {
    return await task();
  } catch (err) {
    errorMessage.value = err.message;
    return null;
  }
}

function load(template, { dirty = false } = {}) {
  editing.value = { ...template, clauses: withKeys(template.clauses) };
  // Un tipo nuevo o duplicado nace "sin guardar" para que el botón Guardar esté activo.
  savedSnapshot.value = dirty ? '' : snapshot(editing.value);
}

function confirmDiscard() {
  return !isDirty.value || confirm('Hay cambios sin guardar en el tipo de contrato actual. ¿Descartarlos?');
}

function select(template) {
  if (editing.value?.id === template.id || !confirmDiscard()) return;
  load(template);
}

function startNew() {
  if (!confirmDiscard()) return;
  load({ id: null, label: '', title: '', intro: DEFAULT_INTRO, closing: DEFAULT_CLOSING, clauses: [] }, { dirty: true });
}

function duplicate() {
  if (!confirmDiscard()) return;
  const source = editing.value;
  load({ ...source, id: null, label: `${source.label} (copia)` }, { dirty: true });
}

async function refresh() {
  templates.value = await request('/api/contract-templates');
}

async function save() {
  isSaving.value = true;
  await run(async () => {
    const { id, label, title, intro, closing } = editing.value;
    const body = JSON.stringify({ label, title, intro, closing, clauses: stripKeys(editing.value.clauses) });
    const saved = id
      ? await request(`/api/contract-templates/${id}`, { method: 'PUT', body })
      : await request('/api/contract-templates', { method: 'POST', body });
    load(saved);
    await refresh();
  });
  isSaving.value = false;
}

async function remove() {
  if (!confirm(`¿Eliminar el tipo "${editing.value.label}"? Los contratos ya creados con él no se modifican.`)) return;
  await run(async () => {
    await request(`/api/contract-templates/${editing.value.id}`, { method: 'DELETE' });
    editing.value = null;
    await refresh();
  });
}

onMounted(async () => {
  await run(refresh);
  isLoading.value = false;
});
</script>
