<template>
  <main class="container" style="flex: 1;">
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
    <section v-if="historyList.length > 0" style="margin-top: 1rem; margin-bottom: 4rem;">
      <div class="glass-panel" style="padding: 1.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 style="font-family: var(--font-heading); font-size: 1.2rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem;">
            <span>📜</span> Historial de Evaluaciones Recientes
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Total: {{ historyList.length }} consultas
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
          <div
            v-for="item in historyList"
            :key="item.id"
            class="info-box"
            style="cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease;"
            @click="loadHistoryItem(item)"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span class="viability-level-badge" style="font-size: 0.75rem; padding: 0.15rem 0.6rem;">
                {{ item.viabilityLevel }} ({{ item.overallViabilityScore }}%)
              </span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">
                {{ formatDate(item.timestamp) }}
              </span>
            </div>
            <p style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); line-height: 1.3; margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              "{{ item.topic }}"
            </p>
            <div style="font-size: 0.75rem; color: var(--text-sub);">
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
