<template>
  <main class="container-fluid finance-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Finanzas</span>
        <h2 class="section-heading"><span class="heading-icon">💰</span> Ingresos y Egresos</h2>
        <p class="section-subheading finance-subheading">
          Registro de movimientos del negocio (matrículas, publicidad, servicios, sueldos) y el balance resultante.
        </p>
      </div>
      <div class="page-header-actions">
        <button type="button" class="btn-primary finance-add-btn" @click="isFormOpen = !isFormOpen">
          {{ isFormOpen ? '✕ Cerrar' : '+ Registrar movimiento' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box finance-alert-box">⚠️ {{ errorMessage }}</p>
    <p v-if="successMessage" class="info-box finance-success-box">✅ {{ successMessage }}</p>

    <!-- Formulario de registro -->
    <section v-if="isFormOpen" class="glass-panel finance-form-panel">
      <form class="finance-form" @submit.prevent="submitTransaction">
        <div class="finance-type-toggle">
          <button type="button" class="type-btn" :class="{ active: form.type === 'ingreso' }" @click="form.type = 'ingreso'">
            ↑ Ingreso
          </button>
          <button type="button" class="type-btn is-expense" :class="{ active: form.type === 'egreso' }" @click="form.type = 'egreso'">
            ↓ Egreso
          </button>
        </div>

        <div class="finance-form-grid">
          <div class="form-group">
            <label class="form-label">Categoría</label>
            <input v-model="form.category" type="text" class="form-input" list="finance-categories" placeholder="Ej: Matrícula, Publicidad, Sueldos" required />
            <datalist id="finance-categories">
              <option v-for="cat in suggestedCategories" :key="cat" :value="cat" />
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Monto (S/)</label>
            <input v-model="form.amount" type="number" step="0.01" min="0.01" class="form-input" placeholder="0.00" required />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input v-model="form.transactionDate" type="date" class="form-input" required />
          </div>
          <div class="form-group finance-form-desc">
            <label class="form-label">Descripción (opcional)</label>
            <input v-model="form.description" type="text" class="form-input" placeholder="Ej: Pago de tesis de Brayan T." />
          </div>
        </div>

        <button type="submit" class="btn-primary finance-submit-btn" :disabled="isSaving">
          {{ isSaving ? 'Guardando...' : 'Guardar movimiento' }}
        </button>
      </form>
    </section>

    <!-- KPIs -->
    <section class="kpi-row">
      <div class="kpi-tile">
        <span class="kpi-label">Ingresos totales</span>
        <span class="kpi-value kpi-positive">S/ {{ formatAmount(summary.totals.ingreso) }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Egresos totales</span>
        <span class="kpi-value kpi-negative">S/ {{ formatAmount(summary.totals.egreso) }}</span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Balance</span>
        <span class="kpi-value" :class="summary.totals.balance >= 0 ? 'kpi-positive' : 'kpi-negative'">
          S/ {{ formatAmount(summary.totals.balance) }}
        </span>
      </div>
      <div class="kpi-tile">
        <span class="kpi-label">Balance del mes actual</span>
        <span class="kpi-value" :class="currentMonthBalance >= 0 ? 'kpi-positive' : 'kpi-negative'">
          S/ {{ formatAmount(currentMonthBalance) }}
        </span>
      </div>
    </section>

    <div class="finance-main-grid">
      <!-- Ingresos vs Egresos por mes -->
      <section class="glass-panel finance-chart-panel">
        <h3 class="finance-panel-title">Ingresos vs. egresos — últimos 6 meses</h3>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot legend-dot-income"></span>Ingresos</span>
          <span class="legend-item"><span class="legend-dot legend-dot-expense"></span>Egresos</span>
        </div>
        <div class="monthly-chart">
          <div v-for="m in summary.monthly" :key="m.month" class="month-group">
            <div class="month-bars">
              <div
                class="month-bar bar-income"
                :style="{ height: barHeight(m.ingreso) }"
                :title="`Ingresos ${monthLabel(m.month)}: S/ ${formatAmount(m.ingreso)}`"
              ></div>
              <div
                class="month-bar bar-expense"
                :style="{ height: barHeight(m.egreso) }"
                :title="`Egresos ${monthLabel(m.month)}: S/ ${formatAmount(m.egreso)}`"
              ></div>
            </div>
            <span class="month-label">{{ monthLabel(m.month) }}</span>
          </div>
        </div>
      </section>

      <!-- Desglose por categoría -->
      <section class="glass-panel finance-category-panel">
        <h3 class="finance-panel-title">Por categoría</h3>

        <div class="category-block">
          <span class="category-block-title income-title">Ingresos</span>
          <div v-if="incomeCategories.length === 0" class="category-empty">Sin registros todavía.</div>
          <div v-for="cat in incomeCategories" :key="'in-' + cat.category" class="category-row">
            <span class="category-name">{{ cat.category }}</span>
            <div class="category-bar-track">
              <div class="category-bar-fill fill-income" :style="{ width: categoryBarWidth(cat, incomeCategories) }"></div>
            </div>
            <span class="category-amount data-mono">S/ {{ formatAmount(cat.total) }}</span>
          </div>
        </div>

        <div class="category-block">
          <span class="category-block-title expense-title">Egresos</span>
          <div v-if="expenseCategories.length === 0" class="category-empty">Sin registros todavía.</div>
          <div v-for="cat in expenseCategories" :key="'eg-' + cat.category" class="category-row">
            <span class="category-name">{{ cat.category }}</span>
            <div class="category-bar-track">
              <div class="category-bar-fill fill-expense" :style="{ width: categoryBarWidth(cat, expenseCategories) }"></div>
            </div>
            <span class="category-amount data-mono">S/ {{ formatAmount(cat.total) }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Tabla de movimientos -->
    <section class="finance-table-section">
      <div class="finance-table-header">
        <h3 class="finance-panel-title">Movimientos</h3>
        <div class="tabs finance-tabs">
          <button type="button" class="tab-item" :class="{ 'is-active': typeFilter === 'all' }" @click="setTypeFilter('all')">Todos</button>
          <button type="button" class="tab-item" :class="{ 'is-active': typeFilter === 'ingreso' }" @click="setTypeFilter('ingreso')">Ingresos</button>
          <button type="button" class="tab-item" :class="{ 'is-active': typeFilter === 'egreso' }" @click="setTypeFilter('egreso')">Egresos</button>
        </div>
      </div>

      <div v-if="isLoading" class="empty-state">
        <p>Cargando movimientos...</p>
      </div>
      <div v-else-if="transactions.length === 0" class="empty-state">
        <div class="empty-state-visual">
          <img src="/images/finance_balance_art.jpg" alt="Finanzas y Crecimiento" class="empty-state-photo" />
        </div>
        <p class="empty-state-title">Sin movimientos registrados en este período</p>
        <p class="empty-state-text">Usa el botón "+ Registrar movimiento" para anotar tu primer ingreso de matrícula o egreso operativo.</p>
      </div>
      <div v-else class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Registrado por</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in transactions" :key="tx.id">
              <td class="data-mono">{{ formatDate(tx.transaction_date) }}</td>
              <td>
                <span class="pill" :class="tx.type === 'ingreso' ? 'pill-success' : 'pill-danger'">
                  {{ tx.type === 'ingreso' ? '↑ Ingreso' : '↓ Egreso' }}
                </span>
              </td>
              <td>{{ tx.category }}</td>
              <td class="finance-desc-cell">{{ tx.description || '—' }}</td>
              <td class="data-mono" :class="tx.type === 'ingreso' ? 'amount-positive' : 'amount-negative'">
                {{ tx.type === 'ingreso' ? '+' : '−' }} S/ {{ formatAmount(tx.amount) }}
              </td>
              <td>{{ tx.created_by_name || '—' }}</td>
              <td>
                <button type="button" class="btn-secondary finance-delete-btn" @click="removeTransaction(tx.id)">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../apiClient.js';

const SUGGESTED_CATEGORIES = ['Matrícula', 'Publicidad', 'Servicios', 'Sueldos', 'Software y herramientas', 'Comisiones', 'Otro'];

const isFormOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const typeFilter = ref('all');

const transactions = ref([]);
const summary = ref({ totals: { ingreso: 0, egreso: 0, balance: 0 }, byCategory: [], monthly: [] });

const form = reactive({
  type: 'ingreso',
  category: '',
  description: '',
  amount: '',
  transactionDate: new Date().toISOString().slice(0, 10)
});

const suggestedCategories = computed(() => SUGGESTED_CATEGORIES);

const incomeCategories = computed(() => summary.value.byCategory.filter((c) => c.type === 'ingreso').slice(0, 6));
const expenseCategories = computed(() => summary.value.byCategory.filter((c) => c.type === 'egreso').slice(0, 6));

const currentMonthKey = computed(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
});

const currentMonthBalance = computed(() => {
  const bucket = summary.value.monthly.find((m) => m.month === currentMonthKey.value);
  if (!bucket) return 0;
  return bucket.ingreso - bucket.egreso;
});

function formatAmount(value) {
  return Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-PE', { month: 'short', timeZone: 'UTC' }).replace('.', '');
}

function barHeight(value) {
  const max = Math.max(...summary.value.monthly.flatMap((m) => [m.ingreso, m.egreso]), 1);
  const pct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
  return `${pct}%`;
}

function categoryBarWidth(cat, list) {
  const max = Math.max(...list.map((c) => c.total), 1);
  return `${Math.max((cat.total / max) * 100, 6)}%`;
}

async function fetchSummary() {
  try {
    const response = await apiFetch('/api/finance/summary');
    const data = await response.json();
    if (response.ok) summary.value = data;
  } catch (error) {
    console.warn('No se pudo obtener el resumen financiero:', error);
  }
}

async function fetchTransactions() {
  isLoading.value = true;
  try {
    const params = typeFilter.value !== 'all' ? `?type=${typeFilter.value}` : '';
    const response = await apiFetch(`/api/finance/transactions${params}`);
    const data = await response.json();
    if (response.ok) transactions.value = data.transactions || [];
  } catch (error) {
    console.warn('No se pudieron obtener los movimientos:', error);
  } finally {
    isLoading.value = false;
  }
}

function setTypeFilter(type) {
  typeFilter.value = type;
  fetchTransactions();
}

async function submitTransaction() {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const response = await apiFetch('/api/finance/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo registrar el movimiento.');

    form.category = '';
    form.description = '';
    form.amount = '';
    successMessage.value = 'Movimiento registrado correctamente.';
    setTimeout(() => { successMessage.value = ''; }, 3000);
    isFormOpen.value = false;

    await Promise.all([fetchSummary(), fetchTransactions()]);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}

async function removeTransaction(id) {
  if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
  try {
    const response = await apiFetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo eliminar el movimiento.');
    await Promise.all([fetchSummary(), fetchTransactions()]);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(() => {
  fetchSummary();
  fetchTransactions();
});
</script>

<style scoped>
.finance-page {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  box-sizing: border-box;
}

.finance-subheading {
  max-width: 620px;
  margin-bottom: 0;
}

.finance-add-btn {
  width: auto;
  padding: 0.6rem 1.15rem;
}

.finance-alert-box {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.finance-success-box {
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
}

/* Formulario */
.finance-form-panel {
  padding: 1.5rem;
}

.finance-type-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.type-btn {
  flex: 1;
  padding: 0.65rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-sub);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-btn.active {
  background: rgba(46, 125, 70, 0.12);
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
}

.type-btn.is-expense.active {
  background: rgba(200, 85, 50, 0.12);
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}

.finance-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.finance-form-grid .form-group {
  margin-bottom: 0;
}

.finance-form-desc {
  grid-column: 1 / -1;
}

.finance-submit-btn {
  width: auto;
  padding: 0.65rem 1.5rem;
  margin-top: 1.25rem;
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
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
}

.kpi-positive { color: var(--accent-emerald); }
.kpi-negative { color: var(--accent-rose); }

/* Layout principal */
.finance-main-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 1rem;
}

@media (max-width: 900px) {
  .finance-main-grid {
    grid-template-columns: 1fr;
  }
}

.finance-chart-panel,
.finance-category-panel {
  padding: 1.35rem 1.5rem;
}

.finance-panel-title {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-main);
  margin-bottom: 1rem;
}

/* Leyenda (2 series -> siempre presente) */
.chart-legend {
  display: flex;
  gap: 1.1rem;
  margin-bottom: 1.1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-sub);
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot-income { background: var(--accent-emerald); }
.legend-dot-expense { background: var(--accent-rose); }

/* Gráfico mensual: columnas agrupadas, una sola magnitud por barra */
.monthly-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
  height: 180px;
  padding-top: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.month-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  height: 100%;
}

.month-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 100%;
  width: 100%;
  justify-content: center;
}

.month-bar {
  width: 18px;
  max-width: 24px;
  border-radius: 4px 4px 0 0;
  transition: height 0.4s ease;
}

.bar-income { background: var(--accent-emerald); }
.bar-expense { background: var(--accent-rose); }

.month-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

/* Desglose por categoría — magnitud, una sola tonalidad por lista */
.category-block {
  margin-bottom: 1.25rem;
}

.category-block:last-child {
  margin-bottom: 0;
}

.category-block-title {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.65rem;
}

.income-title { color: var(--accent-emerald); }
.expense-title { color: var(--accent-rose); }

.category-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.category-row {
  display: grid;
  grid-template-columns: minmax(80px, 110px) 1fr auto;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.45rem;
}

.category-name {
  font-size: 0.78rem;
  color: var(--text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-bar-track {
  height: 8px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
}

.category-bar-fill {
  height: 100%;
  border-radius: 4px;
}

.fill-income { background: var(--accent-emerald); }
.fill-expense { background: var(--accent-rose); }

.category-amount {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
}

/* Tabla */
.finance-table-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.finance-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.finance-tabs {
  margin-bottom: 0;
  border-bottom: none;
}

.finance-desc-cell {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount-positive { color: var(--accent-emerald); font-weight: 600; }
.amount-negative { color: var(--accent-rose); font-weight: 600; }

.finance-delete-btn {
  padding: 0.3rem 0.55rem;
  font-size: 0.8rem;
}

.empty-state-visual {
  width: 150px;
  height: 110px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 1rem;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}

.empty-state-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (max-width: 768px) {
  .finance-page {
    padding: 1rem;
  }
}
</style>
