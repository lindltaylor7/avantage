<template>
  <main class="container-fluid agents-console">
    <header class="console-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">🤖</span> Consola de Agentes · Avan (WhatsApp)
        </h2>
        <p class="section-subheading">
          Cada tarjeta es un agente del proceso conversacional. Edita su mensaje, actívalo o
          desactívalo, y arrastra para cambiar el orden en que atienden al contacto.
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

    <section class="stats-row">
      <div class="stat-tile">
        <span class="stat-value">{{ steps.length + 1 }}</span>
        <span class="stat-label">Agentes en el pipeline</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value accent-emerald">{{ activeCount }}</span>
        <span class="stat-label">Activos</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value accent-rose">{{ steps.length - activeCount }}</span>
        <span class="stat-label">Inactivos</span>
      </div>
      <div class="stat-tile">
        <span class="stat-value accent-cyan">5s</span>
        <span class="stat-label">Espera del agente de bienvenida</span>
      </div>
    </section>

    <section v-if="isLoading && steps.length === 0" class="empty-state">
      <p>Cargando pipeline de agentes...</p>
    </section>

    <section v-else class="console-body">
      <!-- Canvas: flujo visual del pipeline (arrastra un nodo para reordenar) -->
      <div class="flow-canvas-wrapper">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :default-viewport="{ zoom: 1 }"
          :min-zoom="0.4"
          :max-zoom="1.5"
          :nodes-connectable="false"
          :elements-selectable="false"
          fit-view-on-init
          @node-click="onNodeClick"
          @node-drag-stop="onNodeDragStop"
        >
          <template #node-stepNode="nodeProps">
            <BotFlowNode :data="nodeProps.data" :selected="nodeProps.id === selectedKey" />
          </template>
          <Background :gap="18" pattern-color="var(--border-color)" />
          <Controls :show-interactive="false" />
        </VueFlow>
        <p class="flow-canvas-hint">Haz clic en un nodo para editarlo · arrástralo a los lados para cambiar el orden</p>
      </div>

      <!-- Detail: configuración del agente seleccionado -->
      <section class="agent-detail">
        <template v-if="selectedKey === 'welcome'">
          <div class="agent-detail-header ai-header">
            <div class="agent-identity">
              <span class="agent-avatar-lg avatar-ai">🧠</span>
              <div>
                <h3>Agente de Bienvenida <span class="ai-tag">IA</span></h3>
                <span class="agent-status-pill status-on">Siempre activo</span>
              </div>
            </div>
          </div>

          <div class="agent-detail-body">
            <section class="info-box">
              <h4>⚙️ Cómo funciona</h4>
              <p>
                Cuando un contacto nuevo escribe por primera vez, este agente no responde al
                instante: espera <strong>5 segundos de silencio</strong> desde el último mensaje
                recibido (por si el contacto sigue escribiendo en varias burbujas seguidas). Al
                cumplirse ese silencio, junta todos los mensajes en un solo texto y se lo envía al
                <strong> LLM de Ollama Cloud</strong>.
              </p>
            </section>

            <section class="info-box">
              <h4>💬 Qué genera</h4>
              <p>
                El modelo responde con un saludo breve, cálido y humano (nunca dice que es un bot),
                que reconoce lo que escribió el contacto y termina con una pregunta que lo dirige al
                proceso: contar su tema o problema de tesis. Esa respuesta reemplaza el saludo fijo
                que usaba el bot antes.
              </p>
            </section>

            <section class="info-box">
              <h4>🔗 Entrega el testigo</h4>
              <p>
                Apenas el contacto responde esa pregunta, el control pasa al primer agente activo
                del pipeline de abajo (<strong>{{ firstActiveStepName }}</strong>), y desde ahí sigue
                el guion estructurado normalmente.
              </p>
            </section>

            <div class="chat-preview">
              <span class="preview-label">Ejemplo de conversación</span>
              <div class="chat-bubble incoming">Hola, quisiera hacer mi tesis</div>
              <div class="chat-bubble incoming">sobre algo de inteligencia artificial</div>
              <div class="chat-typing">
                <span></span><span></span><span></span> esperando 5s de silencio...
              </div>
              <div class="chat-bubble outgoing">
                ¡Qué buen tema! 👋 La inteligencia artificial da para mucho en distintas carreras.
                Cuéntame, ¿qué problema específico te gustaría resolver o investigar con IA?
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="selectedStep">
          <div class="agent-detail-header">
            <div class="agent-identity">
              <span class="agent-avatar-lg">{{ STEP_META[selectedStep.stepKey]?.icon || '❓' }}</span>
              <div>
                <h3>{{ STEP_META[selectedStep.stepKey]?.name || selectedStep.stepKey }}</h3>
                <span class="agent-status-pill" :class="selectedStep.active ? 'status-on' : 'status-off'">
                  {{ selectedStep.active ? 'Activo' : 'Inactivo' }}
                </span>
              </div>
            </div>

            <label class="agent-toggle-switch">
              <input type="checkbox" v-model="selectedStep.active" />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>

          <p class="agent-role-desc">{{ STEP_META[selectedStep.stepKey]?.desc }}</p>

          <div class="agent-detail-body">
            <label class="field-label">Texto de la pregunta</label>
            <textarea v-model="selectedStep.questionText" class="step-textarea" rows="3"></textarea>

            <template v-if="selectedStep.inputType === 'choice'">
              <label class="field-label">Opciones (se muestran numeradas)</label>
              <div class="options-list">
                <div v-for="(opt, optIndex) in selectedStep.options" :key="optIndex" class="option-row">
                  <span class="option-number">{{ optIndex + 1 }}.</span>
                  <input v-model="selectedStep.options[optIndex]" type="text" class="option-input" />
                  <button type="button" class="option-remove" @click="removeOption(selectedStep, optIndex)" title="Eliminar opción">✕</button>
                </div>
                <button type="button" class="btn-add-option" @click="addOption(selectedStep)">➕ Agregar opción</button>
              </div>
            </template>

            <label class="field-label">Valor por defecto (si está desactivado)</label>
            <input v-model="selectedStep.defaultValue" type="text" class="default-input" placeholder="Ej: Perú, o déjalo vacío" />

            <div class="chat-preview">
              <span class="preview-label">Vista previa en WhatsApp</span>
              <div class="chat-bubble outgoing">{{ previewText(selectedStep, selectedIndex) }}</div>
            </div>
          </div>
        </template>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { VueFlow, MarkerType } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/controls/dist/style.css';
import BotFlowNode from '../components/BotFlowNode.vue';
import { apiFetch } from '../apiClient.js';

const NODE_WIDTH = 220;
const NODE_GAP = 90;
const NODE_Y = 90;

const STEP_META = {
  problem: { icon: '🧩', name: 'Tema / Problema', desc: 'Extrae el tema o problema de tesis que quiere trabajar el contacto.' },
  location: { icon: '📍', name: 'Ámbito / Ubicación', desc: 'Identifica la ciudad o región de Perú donde se ubicará el estudio.' },
  level: { icon: '🎓', name: 'Nivel académico', desc: 'Determina si es Pregrado o Posgrado para ajustar el reporte.' },
  field: { icon: '🏛️', name: 'Carrera', desc: 'Registra la carrera o área de conocimiento del tema.' },
  email: { icon: '📩', name: 'Correo electrónico', desc: 'Canal de entrega del reporte de viabilidad generado por IA.' }
};

const steps = ref([]);
const savedSnapshot = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const savedMessage = ref('');
const selectedKey = ref('welcome');
const nodes = ref([]);
const edges = ref([]);

const activeCount = computed(() => steps.value.filter((s) => s.active).length);
const selectedIndex = computed(() => steps.value.findIndex((s) => s.stepKey === selectedKey.value));
const selectedStep = computed(() => steps.value[selectedIndex.value] || null);
const firstActiveStepName = computed(() => {
  const first = steps.value.find((s) => s.active);
  return first ? (STEP_META[first.stepKey]?.name || first.stepKey) : 'ninguno (no hay agentes activos)';
});

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

function buildNodes(currentSteps) {
  const list = [
    {
      id: 'welcome',
      type: 'stepNode',
      position: { x: 20, y: NODE_Y },
      draggable: false,
      data: { isWelcome: true }
    }
  ];
  currentSteps.forEach((step, index) => {
    list.push({
      id: step.stepKey,
      type: 'stepNode',
      position: { x: 20 + (index + 1) * (NODE_WIDTH + NODE_GAP), y: NODE_Y },
      draggable: true,
      data: { step, meta: STEP_META[step.stepKey] }
    });
  });
  return list;
}

function buildEdges(currentSteps) {
  const ids = ['welcome', ...currentSteps.map((s) => s.stepKey)];
  const list = [];
  for (let i = 0; i < ids.length - 1; i++) {
    list.push({
      id: `e-${ids[i]}-${ids[i + 1]}`,
      source: ids[i],
      target: ids[i + 1],
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
      style: { stroke: 'var(--border-color)', strokeWidth: 2 }
    });
  }
  return list;
}

function syncFlow() {
  nodes.value = buildNodes(steps.value);
  edges.value = buildEdges(steps.value);
}

function onNodeClick({ node }) {
  if (!node) return;
  selectedKey.value = node.id;
}

function onNodeDragStop({ node }) {
  if (!node || node.id === 'welcome') {
    syncFlow();
    return;
  }
  const stepNodes = nodes.value.filter((n) => n.id !== 'welcome');
  const sortedKeys = [...stepNodes].sort((a, b) => a.position.x - b.position.x).map((n) => n.id);
  const byKey = new Map(steps.value.map((s) => [s.stepKey, s]));
  steps.value = sortedKeys.map((key) => byKey.get(key));
  syncFlow();
}

async function fetchSteps() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-steps');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener el guion del bot.');
    steps.value = (data.steps || []).map(toClientStep);
    savedSnapshot.value = snapshotOf(steps.value);
    if (!steps.value.some((s) => s.stepKey === selectedKey.value)) {
      selectedKey.value = 'welcome';
    }
    syncFlow();
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
    syncFlow();
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

onMounted(fetchSteps);
</script>

<style scoped>
.agents-console {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.console-header {
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
  border: 1px solid var(--surface-4);
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

/* Stats row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.85rem;
}

.stat-tile {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1.1rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.stat-value {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--text-main);
}

.stat-value.accent-emerald { color: var(--accent-emerald); }
.stat-value.accent-rose { color: var(--accent-rose); }
.stat-value.accent-cyan { color: var(--accent-cyan); }

.stat-label {
  font-size: 0.72rem;
  color: var(--text-sub);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

@media (max-width: 860px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Console body: canvas + detail */
.console-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.flow-canvas-wrapper {
  position: relative;
  height: 420px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg-card);
}

.flow-canvas-wrapper :deep(.vue-flow) {
  background: transparent;
}

.flow-canvas-wrapper :deep(.vue-flow__edge-path) {
  stroke-width: 2;
}

.flow-canvas-wrapper :deep(.vue-flow__controls) {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.flow-canvas-wrapper :deep(.vue-flow__controls-button) {
  background: var(--bg-card-solid);
  border-bottom: 1px solid var(--border-color);
  fill: var(--text-main);
}

.flow-canvas-wrapper :deep(.vue-flow__controls-button:hover) {
  background: var(--surface-2);
}

.flow-canvas-hint {
  position: absolute;
  bottom: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.72rem;
  color: var(--text-sub);
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  pointer-events: none;
  white-space: nowrap;
}

/* Detail panel */
.agent-detail {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem 1.4rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-width: 0;
}

.agent-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid var(--border-color);
}

.agent-identity {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.agent-avatar-lg {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: rgba(76, 134, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

.agent-avatar-lg.avatar-ai {
  background: linear-gradient(135deg, #8b5cf6, #4c86ff);
}

.agent-identity h3 {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.agent-status-pill {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
}

.status-on {
  background: rgba(16, 185, 129, 0.15);
  color: var(--accent-emerald);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.status-off {
  background: rgba(244, 63, 94, 0.12);
  color: var(--accent-rose);
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.agent-role-desc {
  font-size: 0.82rem;
  color: var(--text-sub);
  margin-top: -0.4rem;
}

/* Toggle switch */
.agent-toggle-switch {
  cursor: pointer;
  display: inline-flex;
}

.agent-toggle-switch input {
  display: none;
}

.toggle-track {
  width: 44px;
  height: 24px;
  border-radius: 9999px;
  background: rgba(244, 63, 94, 0.25);
  border: 1px solid rgba(244, 63, 94, 0.4);
  position: relative;
  display: inline-block;
  transition: all 0.2s ease;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.agent-toggle-switch input:checked + .toggle-track {
  background: rgba(16, 185, 129, 0.3);
  border-color: rgba(16, 185, 129, 0.5);
}

.agent-toggle-switch input:checked + .toggle-track .toggle-thumb {
  left: 22px;
}

.agent-detail-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: 0.88rem;
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

/* Chat-style preview */
.chat-preview {
  margin-top: 0.6rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  padding: 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.preview-label {
  font-size: 0.68rem;
  color: var(--text-sub);
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.2rem;
}

.chat-bubble {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  max-width: 90%;
  line-height: 1.45;
}

.chat-bubble.outgoing {
  background: rgba(16, 94, 255, 0.18);
  border: 1px solid rgba(16, 94, 255, 0.3);
  align-self: flex-start;
}

.chat-bubble.incoming {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  align-self: flex-end;
}

.chat-typing {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: var(--text-sub);
  font-style: italic;
  padding: 0.2rem 0.3rem;
}

.chat-typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-sub);
  display: inline-block;
  animation: typing-blink 1.2s infinite ease-in-out;
}

.chat-typing span:nth-child(2) { animation-delay: 0.2s; }
.chat-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-blink {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}

.ai-header {
  border-bottom-color: rgba(139, 92, 246, 0.25);
}

@media (max-width: 768px) {
  .agents-console {
    padding: 1rem;
  }
}
</style>
