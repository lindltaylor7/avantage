<template>
  <div class="glass-panel" style="padding: 1.5rem; display: flex; flex-direction: column; height: 620px;">
    <!-- Chat Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, var(--primary), var(--accent-cyan)); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
          🤖
        </div>
        <div>
          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-main); margin: 0;">
            TesiBot Perú AI
          </h3>
          <p style="font-size: 0.75rem; color: var(--accent-emerald); margin: 0; display: flex; align-items: center; gap: 0.3rem;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent-emerald); display: inline-block;"></span>
            Asistente Interactivo para Temas de Tesis
          </p>
        </div>
      </div>

      <button
        v-if="chatMessages.length > 2"
        type="button"
        class="btn-secondary"
        style="font-size: 0.75rem; padding: 0.3rem 0.7rem;"
        @click="resetChat"
      >
        🔄 Reiniciar
      </button>
    </div>

    <!-- Messages Container -->
    <div ref="chatContainer" style="flex: 1; overflow-y: auto; padding-right: 0.5rem; display: flex; flex-direction: column; gap: 1rem;">
      <div
        v-for="(msg, index) in chatMessages"
        :key="index"
        :style="{
          display: 'flex',
          justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start'
        }"
      >
        <div
          :style="{
            maxWidth: '85%',
            padding: '0.85rem 1.1rem',
            borderRadius: msg.sender === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
            background: msg.sender === 'user' ? 'linear-gradient(135deg, var(--primary), var(--primary-hover))' : 'rgba(15, 23, 42, 0.85)',
            border: msg.sender === 'user' ? 'none' : '1px solid var(--border-glow)',
            color: '#FFFFFF',
            fontSize: '0.9rem',
            lineHeight: '1.5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }"
        >
          <!-- Contenido formateado del mensaje -->
          <div style="white-space: pre-line;">{{ msg.text }}</div>

          <!-- Componente especial para Selección de Nivel y Carrera (Paso 3) -->
          <div v-if="msg.step === 3 && currentStep === 3" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
            <div>
              <label style="font-size: 0.8rem; color: var(--accent-cyan); display: block; margin-bottom: 0.3rem;">
                Nivel Académico:
              </label>
              <select v-model="step3Data.level" class="form-select" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                <option value="Pregrado (Bachiller/Título)">Pregrado (Bachiller / Título)</option>
                <option value="Posgrado (Maestría)">Posgrado (Maestría)</option>
                <option value="Posgrado (Doctorado)">Posgrado (Doctorado)</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.8rem; color: var(--accent-cyan); display: block; margin-bottom: 0.3rem;">
                Carrera / Campo de Estudio:
              </label>
              <select v-model="step3Data.field" class="form-select" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
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

            <button class="btn-primary" style="font-size: 0.85rem; padding: 0.5rem 1rem; margin-top: 0.4rem;" @click="confirmStep3">
              Confirmar Nivel y Carrera ➔
            </button>
          </div>
        </div>
      </div>

      <!-- Indicador de escribiendo / cargando -->
      <div v-if="isLoading" style="display: flex; gap: 0.5rem; align-items: center; color: var(--accent-cyan); font-size: 0.85rem; padding: 0.5rem;">
        <div class="spinner" style="width: 16px; height: 16px;"></div>
        <span>Evaluando tema en Ollama Cloud y enviando correo...</span>
      </div>
    </div>

    <!-- Suggested Quick Buttons (para sugerir respuestas al usuario) -->
    <div v-if="currentStep === 1 && !isLoading" style="margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.4rem;">
      <span style="font-size: 0.75rem; color: var(--text-muted); width: 100%;">Sugerencias de inicio:</span>
      <button
        v-for="(sug, idx) in step1Suggestions"
        :key="idx"
        type="button"
        class="btn-secondary"
        style="font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 8px;"
        @click="userInput = sug.text"
      >
        {{ sug.label }}
      </button>
    </div>

    <!-- Input Bar -->
    <form style="margin-top: 1rem; display: flex; gap: 0.5rem;" @submit.prevent="handleSendInput">
      <input
        v-model="userInput"
        type="text"
        class="form-input"
        :placeholder="getInputPlaceholder"
        :disabled="isLoading || currentStep === 3 || isFinished"
        style="border-radius: 12px; font-size: 0.9rem;"
      />
      <button
        type="submit"
        class="btn-primary"
        style="width: auto; padding: 0 1.25rem; border-radius: 12px;"
        :disabled="isLoading || !userInput.trim() || currentStep === 3 || isFinished"
      >
        Enviar ➔
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';

const props = defineProps({
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['submit-thesis']);

const chatContainer = ref(null);
const currentStep = ref(1);
const isFinished = ref(false);
const userInput = ref('');

const chatMessages = ref([]);

const answers = reactive({
  problem: '',
  location: '',
  level: 'Pregrado (Bachiller/Título)',
  field: 'Ingeniería de Sistemas y Computación',
  email: 'riuyagami@gmail.com',
  phone: ''
});

const step3Data = reactive({
  level: 'Pregrado (Bachiller/Título)',
  field: 'Ingeniería de Sistemas y Computación'
});

const step1Suggestions = [
  { label: '🤖 Visión IA en Palta', text: 'Detección temprana de enfermedades en palta Hass mediante visión artificial' },
  { label: '⛏️ ITIL en Minería', text: 'Implementación de ITIL para la gestión de equipos informáticos en unidades mineras' },
  { label: '🏦 Morosidad en MYPEs', text: 'Impacto de score crediticio con Machine Learning en la morosidad de MYPEs' }
];

const getInputPlaceholder = computed(() => {
  if (isFinished.value) return 'Evaluación completada.';
  if (currentStep.value === 1) return 'Escribe el problema o tema que deseas investigar...';
  if (currentStep.value === 2) return 'Escribe la región, empresa o ámbito en Perú...';
  if (currentStep.value === 3) return 'Selecciona nivel y carrera arriba...';
  if (currentStep.value === 4) return 'Escribe tu correo (ej: ejemplo@gmail.com)...';
  if (currentStep.value === 5) return 'Escribe tu número de celular (ej: 987654321)...';
  return 'Escribe tu respuesta...';
});

function initChat() {
  chatMessages.value = [
    {
      sender: 'bot',
      text: '¡Hola! 👋 Soy TesiBot Perú, tu asistente académico con inteligencia artificial.\n\nVoy a hacerte 5 preguntas breves para formular y evaluar la viabilidad de tu tema de tesis en Perú.\n\n📌 **Pregunta 1 de 5:** ¿Cuál es el problema, tecnología o tema principal que deseas investigar?'
    }
  ];
  currentStep.value = 1;
  isFinished.value = false;
}

function handleSendInput() {
  const text = userInput.value.trim();
  if (!text) return;

  // Agregar mensaje del usuario
  chatMessages.value.push({ sender: 'user', text });
  userInput.value = '';
  scrollToBottom();

  if (currentStep.value === 1) {
    answers.problem = text;
    currentStep.value = 2;
    setTimeout(() => {
      chatMessages.value.push({
        sender: 'bot',
        text: `¡Excelente tema! 💡\n\n📌 **Pregunta 2 de 5:** ¿En qué lugar, institución, región o sector específico de Perú planeas enfocar el estudio?\n\n*(Ejemplo: "Región Ica", "Unidades mineras en Junín", "MYPEs de Gamarra", "Hospitales de Lima")*`
      });
      scrollToBottom();
    }, 400);
  } else if (currentStep.value === 2) {
    answers.location = text;
    currentStep.value = 3;
    setTimeout(() => {
      chatMessages.value.push({
        sender: 'bot',
        text: `Muy bien, delimitado a: ${text}.\n\n📌 **Pregunta 3 de 5:** Por favor selecciona tu nivel académico y la carrera a la que perteneces:`,
        step: 3
      });
      scrollToBottom();
    }, 400);
  } else if (currentStep.value === 4) {
    if (!text.includes('@')) {
      chatMessages.value.push({
        sender: 'bot',
        text: '⚠️ Por favor ingresa un correo electrónico válido (ejemplo: usuario@gmail.com).'
      });
      scrollToBottom();
      return;
    }

    answers.email = text;
    currentStep.value = 5;

    setTimeout(() => {
      chatMessages.value.push({
        sender: 'bot',
        text: `Perfecto 👍.\n\n📌 **Pregunta 5 de 5 (Última):** ¿A qué número de celular te podemos contactar para hacer seguimiento a tu tesis?`
      });
      scrollToBottom();
    }, 400);
  } else if (currentStep.value === 5) {
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length < 7) {
      chatMessages.value.push({
        sender: 'bot',
        text: '⚠️ Por favor ingresa un número de celular válido (ejemplo: 987654321).'
      });
      scrollToBottom();
      return;
    }

    answers.phone = text;
    isFinished.value = true;

    // Formular el tema sintetizado
    const synthesizedTopic = `${answers.problem}: Caso de estudio y propuesta en ${answers.location}`;

    setTimeout(() => {
      chatMessages.value.push({
        sender: 'bot',
        text: `🎉 ¡Perfecto! He formulado tu propuesta completa de tesis:\n\n📜 **"${synthesizedTopic}"**\n\n🎓 Nivel: ${answers.level}\n🏛️ Carrera: ${answers.field}\n📩 Correo destinatario: ${answers.email}\n📱 Celular: ${answers.phone}\n\n🧠 Estoy procesando los embeddings en Ollama Cloud y enviando tu reporte completo a tu correo...`
      });
      scrollToBottom();

      // Emitir al componente padre App.vue para llamar a la API
      emit('submit-thesis', {
        topic: synthesizedTopic,
        academicLevel: answers.level,
        fieldOfStudy: answers.field,
        email: answers.email,
        phone: answers.phone,
        additionalNotes: `Problema: ${answers.problem} | Ámbito: ${answers.location}`
      });
    }, 400);
  }
}

function confirmStep3() {
  answers.level = step3Data.level;
  answers.field = step3Data.field;

  chatMessages.value.push({
    sender: 'user',
    text: `Grado: ${answers.level} | Carrera: ${answers.field}`
  });

  currentStep.value = 4;
  scrollToBottom();

  setTimeout(() => {
    chatMessages.value.push({
      sender: 'bot',
      text: `Entendido 👍.\n\n📌 **Pregunta 4 de 5:** ¿A qué correo electrónico deseas que le enviemos el Reporte Completo de Viabilidad con normativas SUNEDU/CONCYTEC?`
    });
    scrollToBottom();
  }, 400);
}

function resetChat() {
  initChat();
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
}

onMounted(() => {
  initChat();
});
</script>
