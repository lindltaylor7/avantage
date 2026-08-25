<template>
  <main class="container-fluid campaigns-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Marketing · Datos de demostración</span>
        <h2 class="section-heading"><span class="heading-icon">📣</span> Campañas</h2>
        <p class="section-subheading campaigns-subheading">
          Vista de ejemplo con datos ficticios para mostrar cómo se vería la trazabilidad de un lead desde que ve el
          anuncio hasta que se agenda o se gana — desde aquí, en producción, se conectaría a Meta Ads y al funnel real.
        </p>
      </div>
    </header>

    <!-- KPIs -->
    <section class="kpi-row">
      <div class="kpi-tile">
        <span class="kpi-label">Campañas activas</span>
        <span class="kpi-value">{{ activeCampaignsCount }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Conversaciones iniciadas</span>
        <span class="kpi-value">{{ totalConversations.toLocaleString('es-PE') }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Tasa de conversación → cita</span>
        <span class="kpi-value">{{ overallMeetingRate }}%</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Costo por cita agendada</span>
        <span class="kpi-value">S/ {{ costPerMeeting }}</span>
      </div>
    </section>

    <!-- Campañas -->
    <section class="campaigns-list">
      <article v-for="campaign in CAMPAIGNS" :key="campaign.id" class="campaign-card">
        <div class="campaign-card-header">
          <div class="campaign-identity">
            <BrandIcon :name="campaign.platform" :size="26" class="campaign-platform-icon" />
            <div>
              <h3 class="campaign-name">{{ campaign.name }}</h3>
              <span class="campaign-meta">{{ campaign.dateRange }} · Inversión S/ {{ campaign.budget.toLocaleString('es-PE') }}</span>
            </div>
          </div>
          <span class="pill" :class="statusPillClass(campaign.status)">{{ statusLabel(campaign.status) }}</span>
        </div>

        <!-- Embudo: una sola forma cromática (magnitud), barras horizontales -->
        <div class="funnel">
          <div v-for="(stage, i) in campaign.funnel" :key="stage.key" class="funnel-row">
            <span class="funnel-label">{{ stage.label }}</span>
            <div class="funnel-bar-track">
              <div
                class="funnel-bar-fill"
                :style="{ width: funnelBarWidth(campaign.funnel, stage) }"
                :title="`${stage.label}: ${stage.count.toLocaleString('es-PE')}`"
              ></div>
              <span class="funnel-bar-value">{{ stage.count.toLocaleString('es-PE') }}</span>
            </div>
            <span v-if="i > 0" class="funnel-dropoff">
              {{ dropoffLabel(campaign.funnel[i - 1], stage) }}
            </span>
            <span v-else class="funnel-dropoff funnel-dropoff-spacer"></span>
          </div>
        </div>

        <button type="button" class="btn-secondary campaign-trace-btn" @click="toggleTrace(campaign.id)">
          {{ openTraceId === campaign.id ? '▲ Ocultar trazabilidad' : '🔍 Ver trazabilidad de leads' }}
        </button>

        <!-- Trazabilidad: recorrido de leads de ejemplo, paso a paso -->
        <div v-if="openTraceId === campaign.id" class="trace-panel">
          <p class="trace-hint">Recorrido real (simulado) de {{ campaign.sampleLeads.length }} leads de esta campaña, desde el clic en el anuncio hasta su etapa actual.</p>
          <div class="trace-leads">
            <div v-for="lead in campaign.sampleLeads" :key="lead.name" class="trace-lead">
              <div class="trace-lead-header">
                <strong class="trace-lead-name">{{ lead.name }}</strong>
                <span class="trace-lead-topic">{{ lead.topic }}</span>
                <span class="pill" :class="stagePillClass(lead.currentStage)">{{ stageLabel(lead.currentStage) }}</span>
              </div>
              <ol class="trace-timeline">
                <li v-for="(step, idx) in lead.timeline" :key="idx" class="trace-step" :class="{ 'is-last': idx === lead.timeline.length - 1 }">
                  <span class="trace-step-dot" :class="stepDotClass(lead, idx)"></span>
                  <span class="trace-step-body">
                    <span class="trace-step-label">{{ step.stage }}</span>
                    <span class="trace-step-time data-mono">{{ step.at }}</span>
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import BrandIcon from '../components/BrandIcon.vue';

// ── Datos ficticios de demostración ──────────────────────────────────────
// En producción, "funnel" vendría de cruzar Meta Ads (impresiones/clics) con
// el Setter Funnel real (whatsapp_bot_sessions + leads.status), y
// "sampleLeads" de la bitácora de actividad del bot + el historial de
// cambios de status del lead.
const CAMPAIGNS = [
  {
    id: 'camp-ig-civil',
    name: 'Ingeniería Civil — Lima Norte',
    platform: 'instagram',
    status: 'activa',
    dateRange: '12 ago – hoy',
    budget: 850,
    funnel: [
      { key: 'impresiones', label: 'Impresiones del anuncio', count: 18400 },
      { key: 'clics', label: 'Clic en "Enviar mensaje"', count: 612 },
      { key: 'conversacion', label: 'Conversación iniciada con Avan', count: 401 },
      { key: 'calificado', label: 'Calificado (tema + correo)', count: 233 },
      { key: 'cita', label: 'Cita agendada', count: 96 },
      { key: 'ganado', label: 'Ganado / matriculado', count: 21 }
    ],
    sampleLeads: [
      {
        name: 'Brayan T.',
        topic: 'Tesis de Ingeniería Civil, desde cero',
        currentStage: 'cita_agendada',
        timeline: [
          { stage: 'Clic en anuncio de Instagram', at: '25 ago, 4:19 p.m.' },
          { stage: 'Primer mensaje a Avan ("hola")', at: '25 ago, 4:19 p.m.' },
          { stage: 'Calificado por Avan', at: '25 ago, 5:41 p.m.' },
          { stage: 'Cita agendada — Mié 26 ago, 5:30 p.m.', at: '25 ago, 5:45 p.m.' }
        ]
      },
      {
        name: 'Milagros Q.',
        topic: 'Gestión de proyectos de construcción vial',
        currentStage: 'ganado',
        timeline: [
          { stage: 'Clic en anuncio de Instagram', at: '18 ago, 9:02 a.m.' },
          { stage: 'Primer mensaje a Avan', at: '18 ago, 9:03 a.m.' },
          { stage: 'Calificado por Avan', at: '18 ago, 9:14 a.m.' },
          { stage: 'Cita agendada', at: '18 ago, 9:16 a.m.' },
          { stage: 'Reunión realizada con asesor', at: '19 ago, 4:00 p.m.' },
          { stage: 'Ganado — matriculada', at: '21 ago, 11:30 a.m.' }
        ]
      },
      {
        name: 'Renzo A.',
        topic: 'Sin tema definido',
        currentStage: 'congelado',
        timeline: [
          { stage: 'Clic en anuncio de Instagram', at: '20 ago, 7:40 p.m.' },
          { stage: 'Primer mensaje a Avan', at: '20 ago, 7:41 p.m.' },
          { stage: 'Avan espera respuesta ("¿Estás ahí?")', at: '20 ago, 8:41 p.m.' },
          { stage: 'Sin respuesta — Congelado', at: '20 ago, 9:41 p.m.' }
        ]
      }
    ]
  },
  {
    id: 'camp-fb-posgrado',
    name: 'Maestrías y Doctorados 2026',
    platform: 'facebook',
    status: 'activa',
    dateRange: '5 ago – hoy',
    budget: 1200,
    funnel: [
      { key: 'impresiones', label: 'Impresiones del anuncio', count: 26100 },
      { key: 'clics', label: 'Clic en "Enviar mensaje"', count: 488 },
      { key: 'conversacion', label: 'Conversación iniciada con Avan', count: 355 },
      { key: 'calificado', label: 'Calificado (tema + correo)', count: 190 },
      { key: 'cita', label: 'Cita agendada', count: 74 },
      { key: 'ganado', label: 'Ganado / matriculado', count: 15 }
    ],
    sampleLeads: [
      {
        name: 'Jean Carlo P.',
        topic: 'Maestría en Ingeniería de Sistemas — línea IA',
        currentStage: 'transferido_closer',
        timeline: [
          { stage: 'Clic en anuncio de Facebook', at: '24 ago, 1:10 p.m.' },
          { stage: 'Primer mensaje a Avan', at: '24 ago, 1:11 p.m.' },
          { stage: 'Calificado por Avan', at: '24 ago, 1:25 p.m.' },
          { stage: 'Sin horarios disponibles esa semana', at: '24 ago, 1:26 p.m.' },
          { stage: 'Transferido a asesor para coordinar', at: '24 ago, 1:26 p.m.' }
        ]
      },
      {
        name: 'Giuliana S.',
        topic: 'Doctorado en Educación',
        currentStage: 'cita_agendada',
        timeline: [
          { stage: 'Clic en anuncio de Facebook', at: '25 ago, 10:02 a.m.' },
          { stage: 'Primer mensaje a Avan', at: '25 ago, 10:03 a.m.' },
          { stage: 'Calificado por Avan', at: '25 ago, 10:19 a.m.' },
          { stage: 'Cita agendada — Jue 27 ago, 4:00 p.m.', at: '25 ago, 10:22 a.m.' }
        ]
      }
    ]
  },
  {
    id: 'camp-ig-sistemas',
    name: 'Desarrollo Web con IA — Pregrado',
    platform: 'instagram',
    status: 'pausada',
    dateRange: '1 ago – 15 ago',
    budget: 600,
    funnel: [
      { key: 'impresiones', label: 'Impresiones del anuncio', count: 12300 },
      { key: 'clics', label: 'Clic en "Enviar mensaje"', count: 340 },
      { key: 'conversacion', label: 'Conversación iniciada con Avan', count: 268 },
      { key: 'calificado', label: 'Calificado (tema + correo)', count: 151 },
      { key: 'cita', label: 'Cita agendada', count: 58 },
      { key: 'ganado', label: 'Ganado / matriculado', count: 12 }
    ],
    sampleLeads: [
      {
        name: 'Fabrizio C.',
        topic: 'Desarrollo web con agentes de IA',
        currentStage: 'ganado',
        timeline: [
          { stage: 'Clic en anuncio de Instagram', at: '10 ago, 6:15 p.m.' },
          { stage: 'Primer mensaje a Avan', at: '10 ago, 6:16 p.m.' },
          { stage: 'Calificado por Avan', at: '10 ago, 6:30 p.m.' },
          { stage: 'Cita agendada', at: '10 ago, 6:32 p.m.' },
          { stage: 'Reunión realizada con asesor', at: '11 ago, 5:00 p.m.' },
          { stage: 'Ganado — matriculado', at: '13 ago, 3:12 p.m.' }
        ]
      }
    ]
  },
  {
    id: 'camp-fb-mineria',
    name: 'ITIL en Unidades Mineras',
    platform: 'facebook',
    status: 'finalizada',
    dateRange: '1 jul – 31 jul',
    budget: 950,
    funnel: [
      { key: 'impresiones', label: 'Impresiones del anuncio', count: 15800 },
      { key: 'clics', label: 'Clic en "Enviar mensaje"', count: 275 },
      { key: 'conversacion', label: 'Conversación iniciada con Avan', count: 198 },
      { key: 'calificado', label: 'Calificado (tema + correo)', count: 102 },
      { key: 'cita', label: 'Cita agendada', count: 39 },
      { key: 'ganado', label: 'Ganado / matriculado', count: 9 }
    ],
    sampleLeads: [
      {
        name: 'Marco V.',
        topic: 'ITIL 4 en gestión de equipos informáticos mineros',
        currentStage: 'descartado',
        timeline: [
          { stage: 'Clic en anuncio de Facebook', at: '15 jul, 8:20 a.m.' },
          { stage: 'Primer mensaje a Avan', at: '15 jul, 8:21 a.m.' },
          { stage: 'Calificado por Avan', at: '15 jul, 8:40 a.m.' },
          { stage: 'Cita agendada', at: '15 jul, 8:42 a.m.' },
          { stage: 'No asistió a la reunión — Descartado', at: '17 jul, 6:00 p.m.' }
        ]
      }
    ]
  }
];

const openTraceId = ref(null);

function toggleTrace(id) {
  openTraceId.value = openTraceId.value === id ? null : id;
}

const activeCampaignsCount = computed(() => CAMPAIGNS.filter((c) => c.status === 'activa').length);

const totalConversations = computed(() =>
  CAMPAIGNS.reduce((sum, c) => sum + (c.funnel.find((s) => s.key === 'conversacion')?.count || 0), 0)
);

const overallMeetingRate = computed(() => {
  const conv = totalConversations.value;
  const citas = CAMPAIGNS.reduce((sum, c) => sum + (c.funnel.find((s) => s.key === 'cita')?.count || 0), 0);
  return conv === 0 ? 0 : Math.round((citas / conv) * 100);
});

const costPerMeeting = computed(() => {
  const totalBudget = CAMPAIGNS.reduce((sum, c) => sum + c.budget, 0);
  const totalCitas = CAMPAIGNS.reduce((sum, c) => sum + (c.funnel.find((s) => s.key === 'cita')?.count || 0), 0);
  return totalCitas === 0 ? 0 : Math.round(totalBudget / totalCitas);
});

function funnelBarWidth(funnel, stage) {
  const max = funnel[0].count || 1;
  const pct = Math.max((stage.count / max) * 100, 4);
  return `${pct}%`;
}

function dropoffLabel(prevStage, stage) {
  if (!prevStage.count) return '';
  const pct = Math.round((stage.count / prevStage.count) * 100);
  return `${pct}% avanza`;
}

const STATUS_META = {
  activa: { label: 'Activa', pill: 'pill-success' },
  pausada: { label: 'Pausada', pill: 'pill-warning' },
  finalizada: { label: 'Finalizada', pill: 'pill-neutral' }
};

function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

function statusPillClass(status) {
  return STATUS_META[status]?.pill || 'pill-neutral';
}

const STAGE_META = {
  cita_agendada: { label: 'Cita agendada', pill: 'pill-warning' },
  ganado: { label: 'Ganado', pill: 'pill-success' },
  transferido_closer: { label: 'Transferido a closer', pill: 'pill-info' },
  congelado: { label: 'Congelado', pill: 'pill-neutral' },
  descartado: { label: 'Descartado', pill: 'pill-danger' }
};

function stageLabel(stage) {
  return STAGE_META[stage]?.label || stage;
}

function stagePillClass(stage) {
  return STAGE_META[stage]?.pill || 'pill-neutral';
}

function stepDotClass(lead, idx) {
  const isLast = idx === lead.timeline.length - 1;
  if (!isLast) return 'is-done';
  if (lead.currentStage === 'ganado') return 'is-won';
  if (lead.currentStage === 'descartado' || lead.currentStage === 'congelado') return 'is-lost';
  return 'is-current';
}
</script>

<style scoped>
.campaigns-page {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  box-sizing: border-box;
}

.campaigns-subheading {
  max-width: 680px;
  margin-bottom: 0;
}

/* KPIs */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.85rem;
}

.kpi-tile {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem 1.15rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.kpi-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.kpi-value {
  font-family: var(--font-heading);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
}

/* Campaign cards */
.campaigns-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.campaign-card {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.35rem 1.5rem;
  box-shadow: var(--shadow-sm);
}

.campaign-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}

.campaign-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.campaign-platform-icon {
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.campaign-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.02rem;
  color: var(--text-main);
}

.campaign-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Embudo — una sola forma cromática (magnitud), barras horizontales */
.funnel {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.funnel-row {
  display: grid;
  grid-template-columns: minmax(140px, 220px) 1fr 72px;
  align-items: center;
  gap: 0.75rem;
}

.funnel-label {
  font-size: 0.78rem;
  color: var(--text-sub);
  text-align: right;
}

.funnel-bar-track {
  position: relative;
  height: 24px;
  background: var(--surface-2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  margin-right: 4.25rem;
}

.funnel-bar-fill {
  height: 24px;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.funnel-bar-value {
  position: absolute;
  left: calc(100% + 0.5rem);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
}

.funnel-dropoff {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  text-align: left;
}

.funnel-dropoff-spacer {
  visibility: hidden;
}

.campaign-trace-btn {
  margin-top: 1.1rem;
  width: auto;
  padding: 0.5rem 1rem;
  font-size: 0.82rem;
}

/* Trazabilidad */
.trace-panel {
  margin-top: 1.1rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--border-color);
}

.trace-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.trace-leads {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.trace-lead {
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem 1.1rem;
}

.trace-lead-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
  margin-bottom: 0.85rem;
}

.trace-lead-name {
  font-size: 0.88rem;
  color: var(--text-main);
}

.trace-lead-topic {
  font-size: 0.76rem;
  color: var(--text-muted);
  flex-basis: 100%;
}

.trace-timeline {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.trace-step {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  position: relative;
  padding-bottom: 0.9rem;
}

.trace-step:not(.is-last)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: -2px;
  width: 2px;
  background: var(--border-color);
}

.trace-step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 2px;
  flex-shrink: 0;
  background: var(--surface-4);
  border: 2px solid var(--bg-card-solid);
  box-shadow: 0 0 0 1px var(--border-color);
}

.trace-step-dot.is-done { background: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.trace-step-dot.is-current { background: var(--accent-amber); box-shadow: 0 0 0 1px var(--accent-amber); }
.trace-step-dot.is-won { background: var(--accent-emerald); box-shadow: 0 0 0 1px var(--accent-emerald); }
.trace-step-dot.is-lost { background: var(--accent-rose); box-shadow: 0 0 0 1px var(--accent-rose); }

.trace-step-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.trace-step-label {
  font-size: 0.8rem;
  color: var(--text-main);
}

.trace-step-time {
  font-size: 0.7rem;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .campaigns-page {
    padding: 1rem;
  }

  .funnel-row {
    grid-template-columns: 1fr;
    gap: 0.3rem;
  }

  .funnel-label {
    text-align: left;
  }

  .funnel-bar-track {
    margin-right: 0;
  }

  .funnel-bar-value {
    position: static;
    margin-left: 0.5rem;
  }

  .funnel-dropoff {
    padding-left: 0.25rem;
  }
}
</style>
