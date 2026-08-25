<template>
  <main class="container home-shell">
    <section class="home-hero">
      <span class="page-eyebrow">Evaluador de viabilidad de tesis</span>
      <h1 class="doc-heading home-hero-title">
        Antes de escribir 200 páginas, sepa si el jurado la va a aprobar.
      </h1>
      <p class="home-hero-sub">
        Avan cruza tu tema contra las líneas prioritarias de CONCYTEC y los criterios de un jurado SUNEDU en Perú,
        y te entrega un dictamen de viabilidad en minutos — no en la sustentación.
      </p>
    </section>

    <div class="main-grid">
      <!-- Chatbot Interactivo (Izquierda) -->
      <div>
        <ThesisChatbot
          :is-loading="isLoading"
          @submit-thesis="handleThesisEvaluation"
        />
      </div>

      <!-- Reporte de Viabilidad (Derecha) -->
      <div>
        <ViabilityReport
          :report="currentReport"
          :email-status="currentEmailStatus"
          @open-email-modal="isEmailModalOpen = true"
        />
      </div>
    </div>

    <!-- Secciones de Historial de Evaluaciones -->
    <section v-if="historyList.length > 0" class="history-section">
      <div class="glass-panel history-panel">
        <div class="history-header">
          <h3 class="history-title">
            <span>📜</span> Historial de evaluaciones recientes
          </h3>
          <span class="history-count">
            Total: {{ historyList.length }} consultas
          </span>
        </div>

        <div class="history-grid">
          <div
            v-for="item in historyList"
            :key="item.id"
            class="info-box history-card"
          >
            <div class="history-card-top">
              <span class="viability-level-badge history-badge">
                {{ item.viabilityLevel }} ({{ item.overallViabilityScore }}%)
              </span>
              <span class="history-time data-mono">
                {{ formatDate(item.timestamp) }}
              </span>
            </div>
            <p class="history-topic">
              "{{ item.topic }}"
            </p>
            <div class="history-meta">
              {{ item.academicLevel }} | ✉️ {{ item.email }}
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Modal de Correo enviado -->
  <EmailModal
    :is-open="isEmailModalOpen"
    :email-status="currentEmailStatus"
    :html-content="currentHtmlContent"
    @close="isEmailModalOpen = false"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import ThesisChatbot from '../components/ThesisChatbot.vue';
import ViabilityReport from '../components/ViabilityReport.vue';
import EmailModal from '../components/EmailModal.vue';

const isLoading = ref(false);
const currentReport = ref(null);
const currentEmailStatus = ref(null);
const currentHtmlContent = ref('');
const isEmailModalOpen = ref(false);
const historyList = ref([]);

async function handleThesisEvaluation(formData) {
  isLoading.value = true;
  try {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.success) {
      currentReport.value = data.report;
      currentEmailStatus.value = data.emailStatus;
      currentHtmlContent.value = data.emailStatus.htmlContent || '';

      // Actualizar historial
      await fetchHistory();
    } else {
      alert('Error en evaluación: ' + (data.error || 'Ocurrió un error en el servidor.'));
    }
  } catch (error) {
    console.error('Error al conectar con la API:', error);
    alert('Error al conectar con el servidor backend Node.js: ' + error.message);
  } finally {
    isLoading.value = false;
  }
}

async function fetchHistory() {
  try {
    const response = await fetch('/api/history');
    if (response.ok) {
      const data = await response.json();
      historyList.value = data.history || [];
    }
  } catch (err) {
    console.warn('Error cargando historial:', err.message);
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => {
  fetchHistory();
});
</script>

<style scoped>
.home-shell {
  flex: 1;
}

.home-hero {
  max-width: 760px;
  margin: 2.75rem 0 2.25rem 0;
}

.home-hero-title {
  font-size: clamp(1.75rem, 3.4vw, 2.6rem);
  line-height: 1.2;
  color: var(--text-main);
  margin: 0.6rem 0 1rem 0;
}

.home-hero-sub {
  font-size: 1rem;
  color: var(--text-sub);
  line-height: 1.6;
  max-width: 620px;
}

.history-section {
  margin-top: 1rem;
  margin-bottom: 4rem;
}

.history-panel {
  padding: 1.75rem;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.history-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.history-count {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.history-card {
  transition: border-color 0.2s ease;
}

.history-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.history-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.6rem;
}

.history-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.history-topic {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
  line-height: 1.3;
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-meta {
  font-size: 0.75rem;
  color: var(--text-sub);
}
</style>
