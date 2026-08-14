<template>
  <div v-if="report" class="glass-panel" style="padding: 2rem;">
    <!-- Encabezado del Reporte -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <h2 class="section-heading">
          <span>📊</span> Resultado de Viabilidad
        </h2>
        <p class="section-subheading" style="margin-bottom: 0;">
          Evaluado para nivel <strong>{{ report.academicLevel }}</strong> en {{ report.fieldOfStudy }}
        </p>
      </div>
      <span :class="['viability-level-badge', getLevelClass(report.evaluation.viabilityLevel)]">
        Viabilidad {{ report.evaluation.viabilityLevel }}
      </span>
    </div>

    <!-- Gauge de Puntuación Principal -->
    <div class="score-card">
      <div class="gauge-wrapper">
        <svg class="gauge-svg" viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="40" />
          <circle
            class="gauge-progress"
            cx="50"
            cy="50"
            r="40"
            :stroke="getScoreColor(report.evaluation.overallViabilityScore)"
            stroke-dasharray="251.2"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <div class="gauge-number">
          {{ report.evaluation.overallViabilityScore }}<span class="gauge-percent">%</span>
        </div>
      </div>
      <p style="font-size: 0.9rem; color: var(--text-muted);">
        Índice Global de Aprobación estimado para Jurados SUNEDU / CONCYTEC
      </p>
    </div>

    <!-- Indicador de Email Enviado -->
    <div v-if="emailStatus" class="email-banner">
      <div class="email-info">
        <span style="font-size: 1.5rem;">📩</span>
        <div>
          <strong style="color: var(--text-main);">Informe enviado por correo</strong>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.8rem;">
            Destinatario: {{ emailStatus.recipient || report.email }} | Modo: {{ emailStatus.mode }}
          </p>
        </div>
      </div>
      <button class="btn-secondary" style="white-space: nowrap;" @click="$emit('open-email-modal')">
        👁️ Ver Plantilla Email
      </button>
    </div>

    <!-- Desglose de Dimensiones (Progress bars) -->
    <div style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
      <h3 style="font-size: 1rem; color: var(--accent-cyan); margin-bottom: 1rem;">
        📈 Evaluación por Dimensiones Clave
      </h3>

      <div class="metric-item">
        <div class="metric-header">
          <span>Rigor Metodológico y Factibilidad</span>
          <strong>{{ report.evaluation.dimensionScores.rigorMethodological }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.rigorMethodological + '%', background: '#105EFF' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Novedad y Aporte Académico</span>
          <strong>{{ report.evaluation.dimensionScores.noveltyAcademic }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.noveltyAcademic + '%', background: '#BFC2C7' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Pertinencia y Relevancia Nacional (Perú)</span>
          <strong>{{ report.evaluation.dimensionScores.peruRelevance }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.peruRelevance + '%', background: '#10B981' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Disponibilidad de Fuentes y Muestra en Perú</span>
          <strong>{{ report.evaluation.dimensionScores.dataAvailability }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.dataAvailability + '%', background: '#F59E0B' }"></div>
        </div>
      </div>
    </div>

    <!-- Metadatos de Embedding Ollama -->
    <div class="info-box" style="margin-bottom: 1.5rem; border-color: rgba(6, 182, 212, 0.3);">
      <h4>🧬 Análisis de Vector de Embedding (Ollama Engine)</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem;">
        <div>
          <span style="color: var(--text-muted);">Modelo Vectorial:</span><br/>
          <strong style="color: var(--text-main);">{{ report.embeddingInfo.model }}</strong>
        </div>
        <div>
          <span style="color: var(--text-muted);">Dimensión del Vector:</span><br/>
          <strong style="color: var(--accent-cyan);">{{ report.embeddingInfo.dimension }} dims</strong>
        </div>
        <div style="grid-column: span 2;">
          <span style="color: var(--text-muted);">Línea Prioritaria CONCYTEC de mayor similitud:</span><br/>
          <strong style="color: var(--accent-emerald);">
            {{ report.priorityAlignments[0].priorityArea }} ({{ report.priorityAlignments[0].alignmentPercentage }}% coincidencia)
          </strong>
        </div>
      </div>
    </div>

    <!-- Fortalezas y Riesgos Grid -->
    <div class="details-grid">
      <div class="info-box">
        <h4 style="color: var(--accent-emerald);">✨ Fortalezas Principales</h4>
        <ul>
          <li v-for="(strength, idx) in report.evaluation.strengths" :key="idx">
            {{ strength }}
          </li>
        </ul>
      </div>

      <div class="info-box">
        <h4 style="color: var(--accent-rose);">⚠️ Observaciones / Riesgos</h4>
        <ul>
          <li v-for="(risk, idx) in report.evaluation.risksAndLimitations" :key="idx">
            {{ risk }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Delimitación y Enfoque Recomendado -->
    <div class="info-box" style="background: rgba(16, 94, 255, 0.12); border-color: rgba(16, 94, 255, 0.4);">
      <h4 style="color: #6E9BFF;">🎯 Delimitación Recomendada para Plan de Tesis</h4>
      <p style="font-size: 0.95rem; font-style: italic; color: #EFF6FF; margin-bottom: 0.75rem;">
        {{ report.evaluation.recommendedDelimitation }}
      </p>
      <div style="font-size: 0.85rem; color: #A9C1FF;">
        <strong>Enfoque Metodológico Sugerido:</strong> {{ report.evaluation.suggestedMethodology.approach }} | 
        <strong>Diseño:</strong> {{ report.evaluation.suggestedMethodology.design }}<br/>
        <strong>Ámbito / Muestra recomendada:</strong> {{ report.evaluation.suggestedMethodology.sampleOrDataTarget }}
      </div>
    </div>
  </div>

  <!-- Empty State Placeholder -->
  <div v-else class="glass-panel" style="padding: 3rem 2rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 480px;">
    <div style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.8;">🎓</div>
    <h3 style="font-family: var(--font-heading); font-size: 1.35rem; color: var(--text-main); margin-bottom: 0.5rem;">
      Esperando Solicitud de Evaluación
    </h3>
    <p style="color: var(--text-muted); max-width: 420px; font-size: 0.9rem; line-height: 1.5;">
      Completa el formulario con tu tema de tesis para generar los embeddings vectoriales con Ollama y calcular el índice de viabilidad académica en Perú.
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  report: {
    type: Object,
    default: null
  },
  emailStatus: {
    type: Object,
    default: null
  }
});

defineEmits(['open-email-modal']);

const dashOffset = computed(() => {
  if (!props.report) return 251.2;
  const score = props.report.evaluation.overallViabilityScore;
  const circumference = 2 * Math.PI * 40; // ~251.3
  return circumference - (score / 100) * circumference;
});

function getScoreColor(score) {
  if (score >= 80) return '#10B981';
  if (score >= 68) return '#105EFF';
  if (score >= 55) return '#F59E0B';
  return '#F43F5E';
}

function getLevelClass(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('media-alta')) return 'level-media-alta';
  if (l.includes('alta')) return 'level-alta';
  if (l.includes('media')) return 'level-media';
  return 'level-baja';
}
</script>
