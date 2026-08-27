<template>
  <section class="ledger-tab">
    <div class="ledger-toolbar">
      <p class="ledger-hint">
        Ingresos (pestaña INGRESOS + asientos positivos del libro diario en soles) y
        egresos (asientos negativos del libro diario en soles), por mes y por banco.
      </p>
      <div class="ov-range">
        <button
          v-for="opt in RANGE_OPTIONS"
          :key="opt"
          type="button"
          class="tab-item"
          :class="{ 'is-active': months === opt }"
          @click="setRange(opt)"
        >
          {{ opt }} meses
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>

    <section class="kpi-row">
      <div class="kpi-tile">
        <span class="kpi-label">Ingresos ({{ months }} meses)</span>
        <span class="kpi-value kpi-positive">S/ {{ fmt(data.totals.ingresos) }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Egresos ({{ months }} meses)</span>
        <span class="kpi-value kpi-negative">S/ {{ fmt(data.totals.egresos) }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Balance</span>
        <span
          class="kpi-value"
          :class="data.totals.balance >= 0 ? 'kpi-positive' : 'kpi-negative'"
        >S/ {{ fmt(data.totals.balance) }}</span>
      </div>
    </section>

    <div class="chart-legend">
      <span v-for="b in data.banks" :key="b" class="legend-item">
        <span class="legend-dot" :style="{ background: BANK_COLORS[b] }"></span>{{ b }}
      </span>
    </div>

    <div v-if="isLoading" class="empty-state"><p>Cargando resumen...</p></div>
    <div v-else-if="isEmpty" class="empty-state">
      <p class="empty-state-title">Sin movimientos en el período</p>
      <p class="empty-state-text">
        Registra ingresos o asientos del libro diario para ver las gráficas por mes y banco.
      </p>
    </div>
    <div v-else class="ov-grid">
      <section class="glass-panel ov-panel">
        <h3 class="ov-panel-title">Ingresos por mes</h3>
        <div class="ov-chart">
          <div v-for="(month, i) in data.months" :key="'in-' + month" class="ov-col">
            <div class="ov-stack">
              <div
                v-for="serie in data.ingresos"
                :key="serie.banco"
                class="ov-seg"
                :style="{ height: segHeight(serie.values[i]), background: BANK_COLORS[serie.banco] }"
                :title="`${serie.banco} · ${monthLabel(month)}: S/ ${fmt(serie.values[i])}`"
              ></div>
            </div>
            <span class="ov-col-total">S/ {{ fmtShort(monthTotal(data.ingresos, i)) }}</span>
            <span class="ov-col-label">{{ monthLabel(month) }}</span>
          </div>
        </div>
      </section>

      <section class="glass-panel ov-panel">
        <h3 class="ov-panel-title">Egresos por mes</h3>
        <div class="ov-chart">
          <div v-for="(month, i) in data.months" :key="'eg-' + month" class="ov-col">
            <div class="ov-stack">
              <div
                v-for="serie in data.egresos"
                :key="serie.banco"
                class="ov-seg"
                :style="{ height: segHeight(serie.values[i]), background: BANK_COLORS[serie.banco] }"
                :title="`${serie.banco} · ${monthLabel(month)}: S/ ${fmt(serie.values[i])}`"
              ></div>
            </div>
            <span class="ov-col-total">S/ {{ fmtShort(monthTotal(data.egresos, i)) }}</span>
            <span class="ov-col-label">{{ monthLabel(month) }}</span>
          </div>
        </div>
      </section>

      <section class="glass-panel ov-panel ov-panel-wide">
        <h3 class="ov-panel-title">Totales por banco</h3>
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th>Banco</th><th>Ingresos</th><th>Egresos</th><th>Balance</th></tr>
            </thead>
            <tbody>
              <tr v-for="b in data.totals.byBank" :key="b.banco">
                <td>
                  <span class="legend-dot" :style="{ background: BANK_COLORS[b.banco] }"></span>
                  {{ b.banco }}
                </td>
                <td class="data-mono amount-positive">S/ {{ fmt(b.ingresos) }}</td>
                <td class="data-mono amount-negative">S/ {{ fmt(b.egresos) }}</td>
                <td
                  class="data-mono"
                  :class="b.ingresos - b.egresos >= 0 ? 'amount-positive' : 'amount-negative'"
                >S/ {{ fmt(b.ingresos - b.egresos) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { apiFetch } from "../../apiClient.js";

const RANGE_OPTIONS = [6, 12];
const BANK_COLORS = {
  BCP: "var(--accent-cyan)",
  Interbank: "var(--accent-emerald)",
  Efectivo: "var(--accent-amber)",
};

const months = ref(6);
const isLoading = ref(false);
const errorMessage = ref("");
const data = ref({
  months: [],
  banks: [],
  ingresos: [],
  egresos: [],
  totals: { ingresos: 0, egresos: 0, balance: 0, byBank: [] },
});

const isEmpty = computed(
  () => data.value.totals.ingresos === 0 && data.value.totals.egresos === 0,
);

const sharedMax = computed(() => {
  let max = 1;
  data.value.months.forEach((_, i) => {
    max = Math.max(
      max,
      monthTotal(data.value.ingresos, i),
      monthTotal(data.value.egresos, i),
    );
  });
  return max;
});

function monthTotal(series, idx) {
  return series.reduce((sum, serie) => sum + (serie.values[idx] || 0), 0);
}

function segHeight(value) {
  const pct = ((value || 0) / sharedMax.value) * 100;
  return `${value > 0 ? Math.max(pct, 1.5) : 0}%`;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtShort(value) {
  const n = Number(value || 0);
  if (n >= 1000) return `${(n / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("es-PE", { maximumFractionDigits: 0 });
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" })
    .replace(".", "");
}

async function fetchOverview() {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/overview?months=${months.value}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo obtener el resumen.");
    data.value = payload;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
}

function setRange(value) {
  if (months.value === value) return;
  months.value = value;
  fetchOverview();
}

onMounted(fetchOverview);
</script>

<style scoped>
.ledger-tab {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ledger-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.ledger-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 640px;
  margin: 0;
}

.ledger-alert {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.ov-range {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.ov-range .tab-item {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-main);
}

.kpi-positive {
  color: var(--accent-emerald);
}
.kpi-negative {
  color: var(--accent-rose);
}

.chart-legend {
  display: flex;
  gap: 1.1rem;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-sub);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
  display: inline-block;
}

.ov-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.ov-panel {
  padding: 1.35rem 1.5rem;
}

.ov-panel-wide {
  grid-column: 1 / -1;
}

.ov-panel-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-main);
  margin-bottom: 1rem;
}

.ov-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.4rem;
  height: 210px;
  padding-top: 0.5rem;
}

.ov-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.ov-stack {
  display: flex;
  flex-direction: column-reverse;
  width: 70%;
  max-width: 34px;
  height: 100%;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
  background: var(--surface-2);
}

.ov-seg {
  width: 100%;
  transition: height 0.35s ease;
}

.ov-col-total {
  font-size: 0.66rem;
  color: var(--text-sub);
  white-space: nowrap;
}

.ov-col-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

.amount-positive {
  color: var(--accent-emerald);
  font-weight: 600;
}
.amount-negative {
  color: var(--accent-rose);
  font-weight: 600;
}

@media (max-width: 900px) {
  .ov-grid {
    grid-template-columns: 1fr;
  }
}
</style>
