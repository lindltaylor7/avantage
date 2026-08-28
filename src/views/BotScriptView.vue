<template>
  <main class="container-fluid bot-settings-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Configuración de Avan</span>
        <h2 class="section-heading"><span class="heading-icon">🤖</span> Personalidad y objetivo del bot</h2>
        <p class="section-subheading bot-subheading">
          Avan ya no sigue un guion de preguntas fijas: conversa libremente guiado por IA hasta reunir el tema de
          tesis y la carrera o universidad del contacto, y luego le ofrece una reunión con el jefe comercial (telefónica o por Meet).
          Aquí ajustas su tono y los valores por defecto que usa cuando el contacto no menciona su nivel o ámbito.
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
        <div class="form-group">
          <label class="form-label">Instrucciones de tono y objetivo</label>
          <textarea
            v-model="form.toneInstructions"
            class="form-textarea bot-tone-textarea"
            rows="6"
            placeholder="Ej: Sé cercano y curioso, no insistas más de una vez si el contacto no da un dato opcional..."
          ></textarea>
          <p class="bot-field-hint">
            Se agrega al prompt del LLM en cada turno, junto con las reglas base ya integradas (mensajes cortos de
            WhatsApp, una sola pregunta a la vez, transparente si le preguntan si es un bot).
          </p>
        </div>

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

const form = reactive({
  toneInstructions: '',
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
    defaultAcademicLevel: settings.default_academic_level || 'Pregrado (Bachiller/Título)',
    defaultFieldOfStudy: settings.default_field_of_study || '',
    defaultLocation: settings.default_location || '',
    shortRepliesEnabled: settings.short_replies_enabled == null ? true : !!settings.short_replies_enabled,
    typingIndicatorEnabled: settings.typing_indicator_enabled == null ? true : !!settings.typing_indicator_enabled,
    messageGapSeconds: settings.message_gap_seconds == null ? 5 : Number(settings.message_gap_seconds)
  };
}

const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value);

async function fetchSettings() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/whatsapp/bot-settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al obtener la configuración del bot.');
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
  min-height: 140px;
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
