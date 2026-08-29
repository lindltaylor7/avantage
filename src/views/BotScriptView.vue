<template>
  <main class="container-fluid bot-settings-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Configuración de Avan</span>
        <h2 class="section-heading"><span class="heading-icon">🤖</span> Personalidad y objetivo del bot</h2>
        <p class="section-subheading bot-subheading">
          Avan ya no sigue un guion de preguntas fijas: conversa libremente guiado por IA hasta reunir el tema de
          tesis y la carrera o universidad del contacto, y luego le ofrece una reunión con el jefe comercial (telefónica o por Meet).
          Aquí ajustas su identidad, su objetivo, las reglas de comportamiento (que puedes agregar o quitar) y los
          valores por defecto que usa cuando el contacto no menciona su nivel o ámbito.
        </p>
      </div>

      <div class="page-header-actions">
        <button class="btn-secondary" @click="fetchSettings" :disabled="isLoading">
          <span :class="{ 'spin-animation': isLoading }">🔄</span> Actualizar
        </button>
        <button class="btn-primary bot-save-btn" @click="save" :disabled="isSaving || !isDirty">
          {{ isSaving ? 'Guardando...' : (isDirty ? '💾 Guardar cambios' : '✅ Guardado') }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box bot-alert-box">⚠️ {{ errorMessage }}</p>
    <p v-if="savedMessage" class="info-box bot-success-box">✅ {{ savedMessage }}</p>

    <section v-if="isLoading" class="empty-state">
      <span class="empty-state-icon">⏳</span>
      <p class="empty-state-title">Cargando configuración...</p>
    </section>

    <template v-else>
      <section class="glass-panel bot-settings-panel">
        <div class="bot-panel-head">
          <h3 class="bot-info-title">🧠 Personalidad y reglas</h3>
          <button type="button" class="btn-secondary bot-restore-btn" @click="restoreDefaults" :disabled="!promptDefaults">
            ↩️ Restaurar textos por defecto
          </button>
        </div>

        <div class="form-group">
          <label class="form-label">Identidad del bot</label>
          <textarea
            v-model="form.botIdentity"
            class="form-textarea"
            rows="2"
            placeholder="Ej: Eres Avan, el asistente de Avantage Group (Perú), conversando por WhatsApp..."
          ></textarea>
          <p class="bot-field-hint">Quién es Avan. Primera línea del prompt. Si lo dejas vacío se usa el texto por defecto.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Objetivo de la conversación</label>
          <textarea
            v-model="form.botObjective"
            class="form-textarea"
            rows="4"
            placeholder="Ej: Entender el tema de tesis de la persona y ofrecerle una reunión con el jefe comercial..."
          ></textarea>
          <p class="bot-field-hint">El cierre que busca Avan. Si lo dejas vacío se usa el texto por defecto.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Reglas del equipo</label>
          <p class="bot-field-hint bot-rules-intro">
            Se inyectan como lista numerada en cada turno del LLM. Puedes agregar, editar o quitar las que quieras.
          </p>
          <div class="bot-rules-list">
            <div v-for="(rule, index) in form.promptRules" :key="index" class="bot-rule-row">
              <span class="bot-rule-num">{{ index + 1 }}</span>
              <textarea
                class="form-textarea bot-rule-input"
                rows="2"
                v-model="form.promptRules[index]"
                placeholder="Escribe una regla de comportamiento..."
              ></textarea>
              <button type="button" class="bot-rule-remove" title="Quitar esta regla" @click="removeRule(index)">✕</button>
            </div>
          </div>
          <button type="button" class="btn-secondary bot-add-rule-btn" @click="addRule">＋ Agregar regla</button>
        </div>

        <div class="form-group">
          <label class="form-label">Instrucciones adicionales del equipo (opcional)</label>
          <textarea
            v-model="form.toneInstructions"
            class="form-textarea bot-tone-textarea"
            rows="4"
            placeholder="Ej: Sé cercano y curioso, no insistas más de una vez si el contacto no da un dato opcional..."
          ></textarea>
          <p class="bot-field-hint">
            Texto libre que se agrega al final del prompt, después de las reglas del equipo.
          </p>
        </div>

        <div class="info-box bot-fixed-rules-box">
          <h4>🔒 Reglas fijas del sistema (no editables)</h4>
          <p>
            Estas son estructurales y las aplica el código, no el prompt: datos obligatorios (tema de tesis + carrera o
            universidad), nunca pedir correo / nivel / ámbito, el formato JSON de la respuesta del LLM y el momento exacto
            en que se pasa a proponer la reunión.
          </p>
        </div>
      </section>

      <section class="glass-panel bot-settings-panel">
        <h3 class="bot-info-title">🎓 Valores por defecto</h3>
        <div class="bot-defaults-grid">
          <div class="form-group">
            <label class="form-label">Nivel académico por defecto</label>
            <select v-model="form.defaultAcademicLevel" class="form-select">
              <option value="Pregrado (Bachiller/Título)">Pregrado (Bachiller / Título)</option>
              <option value="Posgrado (Maestría)">Posgrado (Maestría)</option>
              <option value="Posgrado (Doctorado)">Posgrado (Doctorado)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Carrera / campo por defecto</label>
            <input v-model="form.defaultFieldOfStudy" type="text" class="form-input" placeholder="Ej: Ingeniería de Sistemas y Computación" />
          </div>

          <div class="form-group">
            <label class="form-label">Ámbito / ubicación por defecto</label>
            <input v-model="form.defaultLocation" type="text" class="form-input" placeholder="Ej: Perú" />
          </div>
        </div>
        <p class="bot-field-hint">
          Se usan solo si la conversación llega al tema y al correo sin que Avan logre identificar estos datos.
        </p>
      </section>

      <section class="glass-panel bot-settings-panel">
        <h3 class="bot-info-title">💬 Comportamiento de los mensajes</h3>

        <label class="bot-toggle-row">
          <input type="checkbox" v-model="form.shortRepliesEnabled" />
          <span>
            <strong>Respuestas cortas</strong>
            <span class="bot-field-hint">Fuerza al bot a responder en 1 línea, directo al grano, sin introducciones ni cierres largos.</span>
          </span>
        </label>

        <label class="bot-toggle-row">
          <input type="checkbox" v-model="form.typingIndicatorEnabled" />
          <span>
            <strong>Mostrar "escribiendo…"</strong>
            <span class="bot-field-hint">Antes de cada respuesta, marca el mensaje del contacto como leído y muestra el indicador de escritura de WhatsApp.</span>
          </span>
        </label>

        <div class="form-group bot-gap-group">
          <label class="form-label">Espera mínima entre mensajes del bot (segundos)</label>
          <input v-model.number="form.messageGapSeconds" type="number" min="0" max="60" class="form-input bot-gap-input" />
          <p class="bot-field-hint">
            Espera estricta entre dos mensajes seguidos del bot al mismo contacto, para no caer en comportamiento de spam. Recomendado: 5.
          </p>
        </div>
      </section>

      <section class="glass-panel bot-info-panel">
        <h3 class="bot-info-title">⚙️ Cómo funciona ahora</h3>
        <div class="bot-info-grid">
          <div class="info-box">
            <h4>💬 Conversación libre</h4>
            <p>En cada turno, el LLM decide qué responder y qué preguntar de forma natural, sin numerar preguntas ni forzar un orden fijo.</p>
          </div>
          <div class="info-box">
            <h4>🧩 Extracción en segundo plano</h4>
            <p>Va identificando tema, carrera, universidad, ámbito y nivel del hilo real de la conversación (y el correo solo si el contacto lo menciona), sin que note que está "llenando un formulario".</p>
          </div>
          <div class="info-box">
            <h4>📅 Cierre con agendamiento</h4>
            <p>Con el tema y la carrera o universidad ya en mano, ofrece la reunión con el jefe comercial, pregunta si la quiere telefónica o por Meet (10% dto.), pide el número o el correo según corresponda y propone los horarios libres reales del calendario (hasta 2 días desde hoy).</p>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const savedMessage = ref('');
const savedSnapshot = ref('');
const promptDefaults = ref(null);

const form = reactive({
  toneInstructions: '',
  botIdentity: '',
  botObjective: '',
  promptRules: [],
  defaultAcademicLevel: 'Pregrado (Bachiller/Título)',
  defaultFieldOfStudy: '',
  defaultLocation: '',
  shortRepliesEnabled: true,
  typingIndicatorEnabled: true,
  messageGapSeconds: 5
});

function toForm(settings) {
  return {
    toneInstructions: settings.tone_instructions || '',
    botIdentity: settings.bot_identity || '',
    botObjective: settings.bot_objective || '',
    promptRules: Array.isArray(settings.prompt_rules) ? [...settings.prompt_rules] : [],
    defaultAcademicLevel: settings.default_academic_level || 'Pregrado (Bachiller/Título)',
    defaultFieldOfStudy: settings.default_field_of_study || '',
    defaultLocation: settings.default_location || '',
    shortRepliesEnabled: settings.short_replies_enabled == null ? true : !!settings.short_replies_enabled,
    typingIndicatorEnabled: settings.typing_indicator_enabled == null ? true : !!settings.typing_indicator_enabled,
    messageGapSeconds: settings.message_gap_seconds == null ? 5 : Number(settings.message_gap_seconds)
  };
}

function addRule() {
  form.promptRules.push('');
}

function removeRule(index) {
  form.promptRules.splice(index, 1);
}

function restoreDefaults() {
  if (!promptDefaults.value) return;
  form.botIdentity = promptDefaults.value.identity || '';
  form.botObjective = promptDefaults.value.objective || '';
  form.promptRules = [...(promptDefaults.value.rules || [])];
}

const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value);

async function fetchSettings() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener la configuración del bot.');
    if (data.promptDefaults) promptDefaults.value = data.promptDefaults;
    Object.assign(form, toForm(data.settings));
    savedSnapshot.value = JSON.stringify(form);
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
    const response = await apiFetch('/api/whatsapp/bot-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración del bot.');
    Object.assign(form, toForm(data.settings));
    savedSnapshot.value = JSON.stringify(form);
    savedMessage.value = 'La configuración se guardó correctamente.';
    setTimeout(() => { savedMessage.value = ''; }, 3000);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}

onMounted(fetchSettings);
</script>

<style scoped>
.bot-settings-page {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 900px;
  box-sizing: border-box;
}

.bot-subheading {
  max-width: 640px;
  margin-bottom: 0;
}

.bot-save-btn {
  width: auto;
  padding: 0.6rem 1.15rem;
}

.spin-animation {
  display: inline-block;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.bot-alert-box {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.bot-success-box {
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
}

.bot-settings-panel {
  padding: 1.5rem;
}

.bot-tone-textarea {
  min-height: 110px;
}

.bot-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.bot-panel-head .bot-info-title {
  margin-bottom: 0;
}

.bot-restore-btn {
  width: auto;
  padding: 0.45rem 0.85rem;
  font-size: 0.8rem;
}

.bot-rules-intro {
  margin-top: 0;
  margin-bottom: 0.6rem;
}

.bot-rules-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.bot-rule-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.bot-rule-num {
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  margin-top: 0.35rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--surface-2, rgba(127, 127, 127, 0.12));
  border-radius: 50%;
}

.bot-rule-input {
  flex: 1;
  min-height: 0;
}

.bot-rule-remove {
  flex-shrink: 0;
  margin-top: 0.35rem;
  width: 1.9rem;
  height: 1.9rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--accent-rose, #c85532);
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}

.bot-rule-remove:hover {
  background: rgba(200, 85, 50, 0.1);
}

.bot-add-rule-btn {
  width: auto;
  padding: 0.45rem 0.9rem;
  font-size: 0.82rem;
}

.bot-fixed-rules-box {
  margin-top: 1.5rem;
}

.bot-fixed-rules-box h4 {
  margin-bottom: 0.35rem;
}

.bot-field-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 0.4rem;
  line-height: 1.5;
}

.bot-defaults-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.bot-defaults-grid .form-group {
  margin-bottom: 0;
}

.bot-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.bot-toggle-row:first-of-type { padding-top: 0.25rem; }

.bot-toggle-row input {
  margin-top: 0.2rem;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.bot-toggle-row span { display: block; }
.bot-toggle-row strong { display: block; font-size: 0.9rem; color: var(--text-main); }
.bot-toggle-row .bot-field-hint { margin-top: 0.15rem; }

.bot-gap-group { margin-top: 1rem; margin-bottom: 0; }
.bot-gap-input { max-width: 120px; }

.bot-info-panel {
  padding: 1.5rem;
}

.bot-info-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-main);
  margin-bottom: 1rem;
}

.bot-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

@media (max-width: 768px) {
  .bot-settings-page {
    padding: 1rem;
  }
}
</style>
