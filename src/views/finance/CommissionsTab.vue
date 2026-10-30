<template>
  <section class="ledger-tab">
    <p class="ledger-hint">
      Dos comisiones del <strong>2%</strong>: la de la <strong>setter</strong>, por cada venta que
      el closer cerró con un lead que ella le pasó (sobre el precio total, al ganarse el lead), y la
      de <strong>cobranza</strong>, por cada cuota cobrada desde el módulo de Cobranzas (sobre lo
      que entró). Es lo que se <strong>debe</strong>: el pago en sí se anota después en
      <strong>Salarios</strong>, así que estas filas no entran en el resumen financiero ni en el
      libro diario.
    </p>

    <div class="ledger-controls">
      <label class="ledger-search">
        <span class="ledger-search-icon" aria-hidden="true">🔎</span>
        <input
          v-model="search"
          type="search"
          class="ledger-search-input"
          placeholder="Buscar por persona, cliente o tema"
          aria-label="Buscar comisiones"
        />
      </label>
      <select v-model="estadoFilter" class="ledger-filter" aria-label="Filtrar por estado">
        <option value="">Todo estado</option>
        <option value="pendiente">Por pagar</option>
        <option value="pagado">Pagada</option>
      </select>
      <!--
        El rango corre sobre la fecha en que la comisión se DEVENGÓ
        (`created_at`, la columna "Registrada" de la tabla) y no sobre `paid_at`:
        esta pestaña es lo que se debe, y lo que importa de un período es qué se
        ganó en él. Cuándo se le abonó se ve en la propia píldora de estado.
      -->
      <LedgerDateRange v-model:desde="desde" v-model:hasta="hasta" noun="Fecha de devengo" />
      <button type="button" class="btn-secondary ledger-add-btn" @click="load" :disabled="isLoading">
        {{ isLoading ? 'Cargando…' : '🔄 Actualizar' }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>

    <p v-if="hasDateRange" class="ledger-range-notice">
      <span>
        Mostrando solo las comisiones devengadas <strong>{{ rangeLabel(desde, hasta) }}</strong>,
        y los dos recuadros cuentan únicamente esas.
      </span>
      <button type="button" class="ledger-range-notice-btn" @click="clearDateRange()">
        Ver todo el histórico
      </button>
    </p>

    <div class="commission-totals">
      <div class="commission-total-card">
        <span class="commission-total-label">Por pagar</span>
        <span class="commission-total-value">S/ {{ formatAmount(summary.pendiente.total) }}</span>
        <span class="commission-total-note">{{ summary.pendiente.n }} comisión(es)</span>
      </div>
      <div class="commission-total-card is-paid">
        <span class="commission-total-label">Ya pagado</span>
        <span class="commission-total-value">S/ {{ formatAmount(summary.pagado.total) }}</span>
        <span class="commission-total-note">{{ summary.pagado.n }} comisión(es)</span>
      </div>
    </div>

    <div v-if="!isLoading && visible.length === 0" class="empty-state">
      <p class="empty-state-title">
        {{ rows.length === 0 ? 'Todavía no hay comisiones' : 'Ninguna comisión coincide' }}
      </p>
      <p v-if="rows.length === 0" class="empty-state-text">
        La de la setter nace sola al ganarse un lead que pasó por el Setter Funnel y tiene precio
        total registrado; la de cobranza, al marcar una cuota como cobrada en Cobranzas.
      </p>
      <p v-else class="empty-state-text">
        <template v-if="hasDateRange">
          No se devengó ninguna comisión {{ rangeLabel(desde, hasta) }}.
        </template>
        Ajusta la búsqueda o los filtros para volver a ver el registro.
      </p>
    </div>

    <div v-else class="data-table-wrapper ledger-table-wrapper">
      <table class="data-table ledger-table">
        <thead>
          <tr>
            <th>Para</th>
            <th>Venta</th>
            <th class="ledger-num">Base</th>
            <th class="ledger-num">%</th>
            <th class="ledger-num">Comisión</th>
            <th>Estado</th>
            <th>Registrada</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row.id">
            <td>
              <span class="ledger-eyebrow">{{ ROLE_LABEL[row.role] || row.role }}</span>
              <span class="ledger-stack-main">{{ row.beneficiario }}</span>
            </td>
            <td>
              <span class="ledger-stack-main">{{ row.cliente || 'Sin nombre' }}</span>
              <span class="ledger-eyebrow">
                <template v-if="row.income_code">Cobro de {{ row.income_code }} · {{ row.income_cuota || 'cuota' }}</template>
                <template v-else>Venta completa · Lead #{{ row.lead_id }}</template>
              </span>
            </td>
            <td class="ledger-num"><span class="ledger-amount">{{ formatAmount(row.base_amount) }}</span></td>
            <td class="ledger-num">{{ Number(row.percent) }}%</td>
            <td class="ledger-num"><strong class="ledger-amount">{{ formatAmount(row.monto) }}</strong></td>
            <td>
              <button
                type="button"
                class="pill"
                :class="row.estado === 'pendiente' ? 'pill-warning' : 'pill-success'"
                :disabled="savingId === row.id"
                :title="row.estado === 'pendiente' ? 'Marcar como pagada' : 'Volver a por pagar'"
                @click="toggleEstado(row)"
              >
                {{ row.estado === 'pendiente' ? 'Por pagar' : `Pagada ${formatDate(row.paid_at)}` }}
              </button>
            </td>
            <td class="ledger-date">{{ formatDate(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../../apiClient.js';
import { formatAmount, formatDate } from './format.js';
import { inDateRange, rangeLabel } from './dateRange.js';
import LedgerDateRange from './LedgerDateRange.vue';
import './ledger.css';

/* De dónde sale cada comisión: la de la setter es por venta, la de cobranza
   por cuota cobrada. */
const ROLE_LABEL = { setter: 'Setter', cobranza: 'Cobranza' };

const rows = ref([]);
const isLoading = ref(false);
const errorMessage = ref('');
const savingId = ref(null);
const search = ref('');
const estadoFilter = ref('');
const desde = ref('');
const hasta = ref('');

const hasDateRange = computed(() => Boolean(desde.value || hasta.value));

function clearDateRange() {
  desde.value = '';
  hasta.value = '';
}

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (estadoFilter.value && row.estado !== estadoFilter.value) return false;
    // `created_at` es un `timestamp` y no una columna `DATE`, así que su día
    // se recorta del tramo ISO igual que lo hace la columna "Registrada" de la
    // tabla (`formatDate`): el filtro y lo que se ve en pantalla tienen que
    // partir el día por el mismo lado.
    if (!inDateRange(row.created_at, desde.value, hasta.value)) return false;
    if (!q) return true;
    return [row.beneficiario, row.cliente, row.tema, row.detalle]
      .some((campo) => String(campo || '').toLowerCase().includes(q));
  });
});

/**
 * Los dos recuadros se calculan sobre lo que se está mirando y ya no se leen
 * del `summary` que manda el servidor: ese cuenta el histórico entero, así que
 * con un rango de fechas puesto decía una cifra que no es la suma de ninguna
 * de las filas de abajo. Es el mismo criterio que la tira de totales de las
 * otras tres pestañas del libro (ver `useLedgerTable`), y acá no cuesta nada
 * porque `/api/commissions` ya devuelve todas las filas de una vez.
 */
const summary = computed(() => {
  const acumular = (estado) => {
    const filas = visible.value.filter((row) => row.estado === estado);
    return {
      // Sin valor absoluto, igual que `commissionService.summary()`: el monto de
      // una comisión se guarda en positivo, y "corregirlo" acá haría que las dos
      // mitades del sistema dejaran de contar lo mismo si alguna vez no lo fuera.
      total: filas.reduce((suma, row) => suma + (Number(row.monto) || 0), 0),
      n: filas.length
    };
  };
  return { pendiente: acumular('pendiente'), pagado: acumular('pagado') };
});

async function load() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await apiFetch('/api/commissions');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las comisiones.');
    rows.value = data.commissions || [];
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
}

/**
 * Marcar pagada no mueve plata: deja constancia de que ya se le abonó (el
 * egreso se registra en Salarios). Por eso se puede deshacer.
 */
async function toggleEstado(row) {
  savingId.value = row.id;
  errorMessage.value = '';
  try {
    const response = await apiFetch(`/api/commissions/${row.id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: row.estado === 'pendiente' ? 'pagado' : 'pendiente' })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado.');
    Object.assign(row, data.commission);
    await load();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingId.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.commission-totals {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
  flex-wrap: wrap;
}

.commission-total-card {
  flex: 1 1 180px;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent-amber);
  border-radius: var(--radius-md);
  background: var(--bg-card-solid);
}

.commission-total-card.is-paid { border-left-color: var(--accent-emerald); }

.commission-total-label { font-size: 0.72rem; color: var(--text-muted); }
.commission-total-value { font-size: 1.1rem; font-weight: 700; color: var(--text-main); }
.commission-total-note { font-size: 0.7rem; color: var(--text-muted); }
</style>
