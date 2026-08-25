<template>
  <main class="container-fluid bot-settings-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Configuración de Avan</span>
        <h2 class="section-heading"><span class="heading-icon">🤖</span> Personalidad y objetivo del bot</h2>
        <p class="section-subheading bot-subheading">
          Avan ya no sigue un guion de preguntas fijas: conversa libremente guiado por IA hasta reunir el tema de
          tesis y el correo del contacto, y luego ofrece agendar una llamada. Aquí ajustas su tono y los valores por
          defecto que usa cuando el contacto no menciona su nivel, carrera o ámbito.
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

      <section class="glass-panel bot-info-panel">
        <h3 class="bot-info-title">⚙️ Cómo funciona ahora</h3>
        <div class="bot-info-grid">
          <div class="info-box">
            <h4>💬 Conversación libre</h4>
            <p>En cada turno, el LLM decide qué responder y qué preguntar de forma natural, sin numerar preguntas ni forzar un orden fijo.</p>
          </div>
          <div class="info-box">
            <h4>🧩 Extracción en segundo plano</h4>
            <p>Va identificando tema, ámbito, nivel, carrera y correo del hilo real de la conversación, sin que el contacto note que está "llenando un formulario".</p>
          </div>
          <div class="info-box">
            <h4>📅 Cierre con agendamiento</h4>
            <p>Al reunir tema y correo, evalúa la viabilidad, envía el reporte por correo, y ofrece agendar una llamada con los horarios libres reales del asesor.</p>
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
  defaultLocation: ''
});

function toForm(settings) {
  return {
    toneInstructions: settings.tone_instructions || '',
    defaultAcademicLevel: settings.default_academic_level || 'Pregrado (Bachiller/Título)',
    defaultFieldOfStudy: settings.default_field_of_study || '',
    defaultLocation: settings.default_location || ''
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
  border-color: rgba(178, 58, 69, 0.4);
  color: var(--accent-rose);
}

.bot-success-box {
  border-color: rgba(47, 125, 90, 0.4);
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
