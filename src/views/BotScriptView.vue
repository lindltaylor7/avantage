<template>
  <main class="container-fluid script-page-wrapper">
    <header class="script-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">🤖</span> Guion de TesiBot (WhatsApp)
        </h2>
        <p class="section-subheading">
          Edita el texto de cada pregunta, cambia el orden arrastrando las tarjetas, y activa o
          desactiva las que no quieras usar.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-secondary" @click="fetchSteps" :disabled="isLoading">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span> Actualizar
        </button>
        <button class="btn-action-primary" @click="save" :disabled="isSaving || !isDirty">
          {{ isSaving ? 'Guardando...' : (isDirty ? '💾 Guardar cambios' : '✅ Guardado') }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box alert-box">⚠️ {{ errorMessage }}</p>
    <p v-if="savedMessage" class="info-box success-box">✅ {{ savedMessage }}</p>

    <section class="info-box">
      <h4>⚠️ Importante sobre desactivar preguntas</h4>
      <p>
        Las 5 preguntas alimentan el reporte de viabilidad y el lead que se crea en el funnel.
        Si desactivas una, el bot no la pregunta y usa en su lugar el <strong>"Valor por defecto"</strong>
        que configures abajo. Si desactivas <strong>"Correo electrónico"</strong> y dejas su valor por
        defecto vacío, no se enviará el reporte por correo (el contacto solo verá el resultado en el chat).
      </p>
    </section>

    <section v-if="isLoading && steps.length === 0" class="empty-state">
      <p>Cargando guion...</p>
    </section>

    <section v-else class="steps-list">
      <article
        v-for="(step, index) in steps"
        :key="step.stepKey"
        class="step-card"
        :class="{ inactive: !step.active, dragging: draggedIndex === index, 'drag-over': hoverIndex === index }"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover.prevent="onDragOver(index)"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
      >
        <div class="step-drag-handle" title="Arrastra para reordenar">⠿</div>

        <div class="step-order-badge">{{ index + 1 }}</div>

        <div class="step-body">
          <div class="step-top-row">
            <span class="step-key-badge">{{ STEP_LABELS[step.stepKey] || step.stepKey }}</span>
            <label class="step-toggle">
              <input type="checkbox" v-model="step.active" />
              <span>{{ step.active ? 'Activa' : 'Inactiva' }}</span>
            </label>
          </div>

          <label class="field-label">Texto de la pregunta</label>
          <textarea v-model="step.questionText" class="step-textarea" rows="2"></textarea>

          <template v-if="step.inputType === 'choice'">
            <label class="field-label">Opciones (se muestran numeradas)</label>
            <div class="options-list">
              <div v-for="(opt, optIndex) in step.options" :key="optIndex" class="option-row">
                <span class="option-number">{{ optIndex + 1 }}.</span>
                <input v-model="step.options[optIndex]" type="text" class="option-input" />
                <button type="button" class="option-remove" @click="removeOption(step, optIndex)" title="Eliminar opción">✕</button>
              </div>
              <button type="button" class="btn-add-option" @click="addOption(step)">➕ Agregar opción</button>
            </div>
          </template>

          <label class="field-label">Valor por defecto (si está desactivada)</label>
          <input v-model="step.defaultValue" type="text" class="default-input" placeholder="Ej: Perú, o déjalo vacío" />

          <div class="step-preview">
            <span class="preview-label">Vista previa:</span>
            <pre class="preview-text">{{ previewText(step, index) }}</pre>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const STEP_LABELS = {
  problem: '1️⃣ Tema / Problema',
  location: '📍 Ámbito / Ubicación',
  level: '🎓 Nivel académico',
  field: '🏛️ Carrera',
  email: '📩 Correo electrónico'
};

const steps = ref([]);
const savedSnapshot = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const savedMessage = ref('');
const draggedIndex = ref(null);
const hoverIndex = ref(null);

function toClientStep(apiStep) {
  return {
    stepKey: apiStep.step_key,
    questionText: apiStep.question_text,
    inputType: apiStep.input_type,
    options: apiStep.options ? [...apiStep.options] : null,
    active: !!apiStep.active,
    defaultValue: apiStep.default_value || ''
  };
}

function snapshotOf(list) {
  return JSON.stringify(list);
}

const isDirty = computed(() => snapshotOf(steps.value) !== savedSnapshot.value);

async function fetchSteps() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-steps');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener el guion del bot.');
    steps.value = (data.steps || []).map(toClientStep);
    savedSnapshot.value = snapshotOf(steps.value);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
}

async function save() {
  isSaving.value = true;
  errorMessage.value = '';
  savedMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-steps', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: steps.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el guion del bot.');
    steps.value = (data.steps || []).map(toClientStep);
    savedSnapshot.value = snapshotOf(steps.value);
    savedMessage.value = 'El guion se guardó correctamente.';
    setTimeout(() => { savedMessage.value = ''; }, 3000);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}

function addOption(step) {
  if (!step.options) step.options = [];
  step.options.push('Nueva opción');
}

function removeOption(step, index) {
  step.options.splice(index, 1);
}

function previewText(step, index) {
  const activeBefore = steps.value.slice(0, index + 1).filter((s) => s.active).length;
  const activeTotal = steps.value.filter((s) => s.active).length || steps.value.length;
  const number = step.active ? activeBefore : '—';
  let text = `📌 Pregunta ${number} de ${activeTotal}: ${step.questionText}`;
  if (step.inputType === 'choice' && step.options?.length) {
    text += '\n\n' + step.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  }
  return text;
}

function onDragStart(index) {
  draggedIndex.value = index;
}

function onDragOver(index) {
  hoverIndex.value = index;
}

function onDrop(index) {
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  const list = [...steps.value];
  const [moved] = list.splice(draggedIndex.value, 1);
  list.splice(index, 0, moved);
  steps.value = list;
  draggedIndex.value = null;
  hoverIndex.value = null;
}

function onDragEnd() {
  draggedIndex.value = null;
  hoverIndex.value = null;
}

onMounted(fetchSteps);
</script>

<style scoped>
.script-page-wrapper {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.script-header {
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

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.btn-action-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 0.6rem 1.15rem;
  font-size: 0.86rem;
  font-weight: 600;
  font-family: var(--font-heading);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn-action-primary:disabled {
  opacity: 0.6;
  cursor: default;
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

.success-box {
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--text-sub);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.step-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.1rem;
  display: flex;
  gap: 0.75rem;
  cursor: grab;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}

.step-card.inactive {
  opacity: 0.55;
}

.step-card.dragging {
  opacity: 0.4;
}

.step-card.drag-over {
  border-color: var(--primary);
}

.step-drag-handle {
  color: var(--text-sub);
  font-size: 1.1rem;
  padding-top: 0.2rem;
  flex-shrink: 0;
}

.step-order-badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(76, 134, 255, 0.15);
  color: var(--accent-cyan);
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.step-key-badge {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  font-family: var(--font-heading);
}

.step-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-sub);
  cursor: pointer;
}

.field-label {
  font-size: 0.72rem;
  color: var(--text-sub);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 0.3rem;
}

.step-textarea, .default-input, .option-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: 0.85rem;
  resize: vertical;
}

.step-textarea:focus, .default-input:focus, .option-input:focus {
  outline: none;
  border-color: var(--primary);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.option-number {
  font-size: 0.78rem;
  color: var(--text-sub);
  width: 1.2rem;
  flex-shrink: 0;
}

.option-input {
  flex: 1;
}

.option-remove {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-add-option {
  align-self: flex-start;
  background: rgba(76, 134, 255, 0.12);
  color: var(--accent-cyan);
  border: 1px solid rgba(76, 134, 255, 0.3);
  border-radius: 8px;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.step-preview {
  margin-top: 0.4rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.preview-label {
  font-size: 0.68rem;
  color: var(--text-sub);
  opacity: 0.8;
}

.preview-text {
  font-family: 'Courier New', monospace;
  font-size: 0.78rem;
  color: var(--text-sub);
  white-space: pre-wrap;
  margin: 0.3rem 0 0;
}

@media (max-width: 768px) {
  .script-page-wrapper {
    padding: 1rem;
  }
}
</style>
