<template>
  <div v-if="report" class="glass-panel report-panel">
    <!-- Encabezado del Reporte -->
    <div class="report-header">
      <div class="report-header-titles">
        <span class="page-eyebrow">Reporte de viabilidad</span>
        <h2 class="doc-heading report-title">Dictamen de Avan</h2>
        <p class="section-subheading report-subheading">
          Evaluado para nivel <strong>{{ report.academicLevel }}</strong> en {{ report.fieldOfStudy }}
        </p>
      </div>
      <span :class="['viability-level-badge', getLevelClass(report.evaluation.viabilityLevel)]">
        Viabilidad {{ report.evaluation.viabilityLevel }}
      </span>
    </div>

    <!-- Sello de Viabilidad -->
    <div class="score-card">
      <SealBadge
        :score="report.evaluation.overallViabilityScore"
        :level="report.evaluation.viabilityLevel"
        :size="176"
      />
      <p class="score-caption">
        Índice global de aprobación estimado para jurados SUNEDU / CONCYTEC
      </p>
    </div>

    <!-- Indicador de Email Enviado -->
    <div v-if="emailStatus" class="email-banner">
      <div class="email-info">
        <span class="email-icon">📩</span>
        <div>
          <strong class="email-info-title">Informe enviado por correo</strong>
          <p class="email-info-sub">
            Destinatario: {{ emailStatus.recipient || report.email }} | Modo: {{ emailStatus.mode }}
          </p>
        </div>
      </div>
      <button class="btn-secondary email-btn" @click="$emit('open-email-modal')">
        👁️ Ver plantilla email
      </button>
    </div>

    <!-- Desglose de Dimensiones (Progress bars) -->
    <div class="dimensions-block">
      <h3 class="dimensions-title">📈 Evaluación por dimensiones clave</h3>

      <div class="metric-item">
        <div class="metric-header">
          <span>Rigor metodológico y factibilidad</span>
          <strong class="data-mono">{{ report.evaluation.dimensionScores.rigorMethodological }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.rigorMethodological + '%', background: 'var(--primary)' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Novedad y aporte académico</span>
          <strong class="data-mono">{{ report.evaluation.dimensionScores.noveltyAcademic }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.noveltyAcademic + '%', background: 'var(--accent-pink)' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Pertinencia y relevancia nacional (Perú)</span>
          <strong class="data-mono">{{ report.evaluation.dimensionScores.peruRelevance }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.peruRelevance + '%', background: 'var(--accent-emerald)' }"></div>
        </div>
      </div>

      <div class="metric-item">
        <div class="metric-header">
          <span>Disponibilidad de fuentes y muestra en Perú</span>
          <strong class="data-mono">{{ report.evaluation.dimensionScores.dataAvailability }}%</strong>
        </div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" :style="{ width: report.evaluation.dimensionScores.dataAvailability + '%', background: 'var(--accent-amber)' }"></div>
        </div>
      </div>
    </div>

    <!-- Metadatos de Embedding Ollama -->
    <div class="info-box embedding-box">
      <h4>🧬 Análisis de vector de embedding (Ollama Engine)</h4>
      <div class="embedding-grid">
        <div>
          <span class="embedding-label">Modelo vectorial:</span><br />
          <strong class="embedding-value data-mono">{{ report.embeddingInfo.model }}</strong>
        </div>
        <div>
          <span class="embedding-label">Dimensión del vector:</span><br />
          <strong class="embedding-value-cyan data-mono">{{ report.embeddingInfo.dimension }} dims</strong>
        </div>
        <div class="embedding-span-2">
          <span class="embedding-label">Línea prioritaria CONCYTEC de mayor similitud:</span><br />
          <strong class="embedding-value-emerald">
            {{ report.priorityAlignments[0].priorityArea }} ({{ report.priorityAlignments[0].alignmentPercentage }}% coincidencia)
          </strong>
        </div>
      </div>
    </div>

    <!-- Fortalezas y Riesgos Grid -->
    <div class="details-grid">
      <div class="info-box">
        <h4 class="info-box-title-emerald">✨ Fortalezas principales</h4>
        <ul>
          <li v-for="(strength, idx) in report.evaluation.strengths" :key="idx">
            {{ strength }}
          </li>
        </ul>
      </div>

      <div class="info-box">
        <h4 class="info-box-title-rose">⚠️ Observaciones / riesgos</h4>
        <ul>
          <li v-for="(risk, idx) in report.evaluation.risksAndLimitations" :key="idx">
            {{ risk }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Delimitación y Enfoque Recomendado -->
    <div class="info-box delimitation-box">
      <h4 class="delimitation-title">🎯 Delimitación recomendada para plan de tesis</h4>
      <p class="delimitation-text">
        {{ report.evaluation.recommendedDelimitation }}
      </p>
      <div class="delimitation-meta">
        <strong>Enfoque metodológico sugerido:</strong> {{ report.evaluation.suggestedMethodology.approach }} |
        <strong>Diseño:</strong> {{ report.evaluation.suggestedMethodology.design }}<br />
        <strong>Ámbito / muestra recomendada:</strong> {{ report.evaluation.suggestedMethodology.sampleOrDataTarget }}
      </div>
    </div>
  </div>

  <!-- Empty State Placeholder -->
  <div v-else class="glass-panel report-empty">
    <div class="report-empty-image-wrapper">
      <img src="/images/thesis_viability_guide.jpg" alt="Evaluador de Viabilidad de Tesis" class="report-empty-img" />
    </div>
    <span class="page-eyebrow">Diagnóstico Automático</span>
    <h3 class="report-empty-title">Esperando solicitud de evaluación</h3>
    <p class="report-empty-text">
      Ingresa tu propuesta en el asistente interactivo para contrastar tu investigación contra los estándares de SUNEDU y CONCYTEC.
    </p>

    <div class="report-empty-features">
      <div class="feature-chip">
        <span>🧬</span> Embeddings Ollama
      </div>
      <div class="feature-chip">
        <span>🇵🇪</span> Líneas CONCYTEC
      </div>
      <div class="feature-chip">
        <span>📊</span> Rigor Metodológico
      </div>
    </div>
  </div>
</template>

<script setup>
import SealBadge from './SealBadge.vue';

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

function getLevelClass(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('media-alta')) return 'level-media-alta';
  if (l.includes('alta')) return 'level-alta';
  if (l.includes('media')) return 'level-media';
  return 'level-baja';
}
</script>

<style scoped>
.report-panel {
  padding: 2rem;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.report-title {
  font-size: 1.9rem;
  color: var(--text-main);
  margin: 0.2rem 0 0.4rem 0;
}

.report-subheading {
  margin-bottom: 0;
}

.score-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.score-caption {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  max-width: 320px;
  margin-top: 0.5rem;
}

.email-icon {
  font-size: 1.5rem;
}

.email-info-title {
  color: var(--text-main);
}

.email-info-sub {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.email-btn {
  white-space: nowrap;
}

.dimensions-block {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

.dimensions-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1rem;
  color: var(--accent-cyan);
  margin-bottom: 1rem;
}

.embedding-box {
  margin-bottom: 1.5rem;
  border-color: rgba(107, 122, 94, 0.3);
}

.embedding-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.embedding-label {
  color: var(--text-muted);
}

.embedding-value {
  color: var(--text-main);
}

.embedding-value-cyan {
  color: var(--accent-cyan);
}

.embedding-value-emerald {
  color: var(--accent-emerald);
}

.embedding-span-2 {
  grid-column: span 2;
}

.info-box-title-emerald { color: var(--accent-emerald); }
.info-box-title-rose { color: var(--accent-rose); }

.delimitation-box {
  background: rgba(111, 129, 37, 0.1);
  border-color: rgba(111, 129, 37, 0.35);
}

.delimitation-title {
  color: var(--on-tint-strong);
}

.delimitation-text {
  font-size: 0.95rem;
  font-style: italic;
  color: var(--on-tint-body);
  margin-bottom: 0.75rem;
}

.delimitation-meta {
  font-size: 0.85rem;
  color: var(--on-tint-muted);
}

.report-empty {
  padding: 2.5rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 520px;
}

.report-empty-image-wrapper {
  width: 220px;
  height: 155px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-color);
  margin-bottom: 1.25rem;
  background: var(--surface-1);
}

.report-empty-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.report-empty-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--text-main);
  margin-top: 0.35rem;
  margin-bottom: 0.5rem;
}

.report-empty-text {
  color: var(--text-muted);
  max-width: 440px;
  font-size: 0.88rem;
  line-height: 1.55;
  margin-bottom: 1.25rem;
}

.report-empty-features {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}

.feature-chip {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  color: var(--text-sub);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
}
</style>
