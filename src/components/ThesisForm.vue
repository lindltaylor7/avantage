<template>
  <div class="glass-panel" style="padding: 2rem;">
    <h2 class="section-heading">
      <span>📝</span> Formulario de Tesis
    </h2>
    <p class="section-subheading">
      Ingresa el tema propuesto para evaluar su viabilidad a nivel de Pregrado o Posgrado en el Perú mediante Ollama Cloud.
    </p>

    <form @submit.prevent="handleSubmit">
      <!-- Tema de Tesis -->
      <div class="form-group">
        <label class="form-label" for="topic-input">
          Tema o Título Propuesto de la Tesis <span style="color: var(--accent-rose);">*</span>
        </label>
        <textarea
          id="topic-input"
          v-model="formData.topic"
          class="form-textarea"
          placeholder="Ej: Implementación de aprendizaje profundo para el diagnóstico temprano de plagas en la agricultura de palta en la región Ica..."
          required
        ></textarea>
        
        <!-- Ejemplos rápidos -->
        <div style="margin-top: 0.6rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Sugerencias rápidas:</span>
          <button
            v-for="(example, idx) in presetExamples"
            :key="idx"
            type="button"
            class="btn-secondary"
            style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 6px;"
            @click="formData.topic = example.topic; formData.academicLevel = example.level; formData.fieldOfStudy = example.field"
          >
            {{ example.label }}
          </button>
        </div>
      </div>

      <!-- Grid Nivel Académico & Carrera -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label" for="level-select">
            Nivel Académico <span style="color: var(--accent-rose);">*</span>
          </label>
          <select id="level-select" v-model="formData.academicLevel" class="form-select">
            <option value="Pregrado (Bachiller/Título)">Pregrado (Bachiller / Título)</option>
            <option value="Posgrado (Maestría)">Posgrado (Maestría)</option>
            <option value="Posgrado (Doctorado)">Posgrado (Doctorado)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="field-select">
            Carrera / Área Académica <span style="color: var(--accent-rose);">*</span>
          </label>
          <select id="field-select" v-model="formData.fieldOfStudy" class="form-select">
            <option value="Ingeniería de Sistemas y Computación">Ingeniería de Sistemas y Computación</option>
            <option value="Ingeniería Agrónoma y Agroindustrial">Ingeniería Agrónoma y Agroindustrial</option>
            <option value="Ciencias de la Salud y Medicina">Ciencias de la Salud y Medicina</option>
            <option value="Administración, Negocios y Finanzas">Administración, Negocios y Finanzas</option>
            <option value="Derecho y Ciencias Políticas">Derecho y Ciencias Políticas</option>
            <option value="Educación y Psicología">Educación y Psicología</option>
            <option value="Ingeniería de Minas y Geología">Ingeniería de Minas y Geología</option>
            <option value="Ingeniería Ambiental y Ecología">Ingeniería Ambiental y Ecología</option>
          </select>
        </div>
      </div>

      <!-- Correo Electrónico Destinatario -->
      <div class="form-group">
        <label class="form-label" for="email-input">
          Correo Electrónico para Enviar Informe <span style="color: var(--accent-rose);">*</span>
        </label>
        <input
          id="email-input"
          v-model="formData.email"
          type="email"
          class="form-input"
          placeholder="ejemplo@universidad.edu.pe"
          required
        />
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem; display: block;">
          El informe completo en HTML con puntuación de SUNEDU/CONCYTEC será enviado a este correo.
        </span>
      </div>

      <!-- Notas Adicionales -->
      <div class="form-group">
        <label class="form-label" for="notes-input">
          Notas o Alcance Específico en Perú (Opcional)
        </label>
        <input
          id="notes-input"
          v-model="formData.additionalNotes"
          type="text"
          class="form-input"
          placeholder="Ej: Se enfocará en microempresas del sector textil en Gamarra..."
        />
      </div>

      <!-- Colapsable Configuración Avanzada Ollama Cloud -->
      <div style="margin-bottom: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <button
          type="button"
          class="btn-secondary"
          style="width: 100%; display: flex; justify-content: space-between; align-items: center;"
          @click="showOllamaConfig = !showOllamaConfig"
        >
          <span style="display: flex; align-items: center; gap: 0.5rem;">
            ⚙️ Configuración Ollama Cloud API Key
          </span>
          <span>{{ showOllamaConfig ? '▲' : '▼' }}</span>
        </button>

        <div v-if="showOllamaConfig" style="margin-top: 1rem; padding: 1rem; background: rgba(15, 23, 42, 0.6); border-radius: 12px; border: 1px solid var(--border-glow);">
          <div class="form-group">
            <label class="form-label" for="ollama-key">Ollama API Key (Opcional / Cloud)</label>
            <input
              id="ollama-key"
              v-model="formData.apiKeyOverride"
              type="password"
              class="form-input"
              placeholder="OLLAMA_API_KEY..."
            />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="ollama-host">Ollama Host Endpoint</label>
            <input
              id="ollama-host"
              v-model="formData.hostOverride"
              type="text"
              class="form-input"
              placeholder="https://api.ollama.com"
            />
          </div>
        </div>
      </div>

      <!-- Botón de Envío -->
      <button type="submit" class="btn-primary" :disabled="isLoading">
        <template v-if="isLoading">
          <div class="spinner"></div>
          <span>Procesando Embedding y Evaluando en Ollama...</span>
        </template>
        <template v-else>
          <span>🚀 Analizar Viabilidad y Enviar Correo</span>
        </template>
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['submit-thesis']);

const showOllamaConfig = ref(false);

const formData = reactive({
  topic: '',
  academicLevel: 'Pregrado (Bachiller/Título)',
  fieldOfStudy: 'Ingeniería de Sistemas y Computación',
  email: 'estudiante.tesis@peru.edu.pe',
  additionalNotes: '',
  apiKeyOverride: '',
  hostOverride: ''
});

const presetExamples = [
  {
    label: '🥑 Palta Agro-IA (Pregrado)',
    topic: 'Implementación de algoritmo de visión por computador en dron para la detección temprana de plagas en cultivos de palta Hass en la provincia de Cañete',
    level: 'Pregrado (Bachiller/Título)',
    field: 'Ingeniería Agrónoma y Agroindustrial'
  },
  {
    label: '⛏️ Minería Verde (Posgrado)',
    topic: 'Modelo de bioremediación con microalgas nativas de la sierra central del Perú para la neutralización de aguas ácidas en relaves mineros de Junín',
    level: 'Posgrado (Maestría)',
    field: 'Ingeniería Ambiental y Ecología'
  },
  {
    label: '🏦 MYPEs Fintech (Pregrado)',
    topic: 'Impacto de las herramientas de score crediticio basado en machine learning sobre la morosidad de las MYPEs comerciales en Gamarra - Lima',
    level: 'Pregrado (Bachiller/Título)',
    field: 'Administración, Negocios y Finanzas'
  }
];

function handleSubmit() {
  if (!formData.topic.trim()) return;
  emit('submit-thesis', { ...formData });
}
</script>
