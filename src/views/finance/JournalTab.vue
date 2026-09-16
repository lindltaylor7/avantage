<template>
  <section class="ledger-tab">
    <p class="ledger-hint">
      Código autogenerado por día. El monto admite valores negativos y el ITF se calcula
      sobre su valor absoluto.
    </p>

    <div class="ledger-controls">
      <label class="ledger-search">
        <span class="ledger-search-icon" aria-hidden="true">🔎</span>
        <input
          v-model="search"
          type="search"
          class="ledger-search-input"
          placeholder="Buscar por código, detalle, área o destino"
          aria-label="Buscar asientos"
        />
      </label>
      <select v-model="estadoFilter" class="ledger-filter" aria-label="Filtrar por estado">
        <option value="">Todo estado</option>
        <option value="pagado">Pagado</option>
        <option value="pendiente">Pendiente</option>
      </select>
      <select v-model="bancoFilter" class="ledger-filter" aria-label="Filtrar por banco">
        <option value="">Todo banco</option>
        <option v-for="b in BANCOS" :key="b" :value="b">{{ b }}</option>
      </select>
      <button type="button" class="btn-primary ledger-add-btn" @click="isFormOpen ? closeForm() : openCreate()">
        {{ isFormOpen ? (editingRow ? '✕ Cancelar edición' : '✕ Cerrar') : '+ Nuevo asiento' }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>
    <p v-if="successMessage" class="info-box ledger-success">✅ {{ successMessage }}</p>

    <section v-if="isFormOpen" class="glass-panel ledger-form-panel">
      <h3 v-if="editingRow" class="ledger-form-title">
        Editando el asiento <strong>{{ editingRow.code }}</strong>
      </h3>
      <form class="ledger-form" @submit.prevent="submit">
        <div class="ledger-form-grid">
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input v-model="form.fecha" type="date" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Monto</label>
            <input v-model="form.monto" type="number" step="0.01" class="form-input" placeholder="Puede ser negativo" required />
          </div>
          <div class="form-group">
            <label class="form-label">Moneda</label>
            <select v-model="form.moneda" class="form-select">
              <option value="soles">Soles</option>
              <option value="dolares">Dólares</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">ITF (calculado)</label>
            <input :value="formatAmount(itfPreview)" type="text" class="form-input" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">Banco</label>
            <select v-model="form.banco" class="form-select" required>
              <option v-for="b in BANCOS" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select v-model="form.estado" class="form-select">
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Área de la empresa</label>
            <input v-model="form.area" type="text" class="form-input" list="journal-areas" placeholder="Ej: Ventas, Operaciones..." />
            <datalist id="journal-areas">
              <option value="Ventas" />
              <option value="Marketing" />
              <option value="Operaciones" />
              <option value="Administración" />
              <option value="Recursos Humanos" />
              <option value="Finanzas" />
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Asiento por destino</label>
            <input v-model="form.asientoPorDestino" type="text" class="form-input" placeholder="Ej: Gasto por servicios..." />
          </div>
          <div class="form-group ledger-form-wide">
            <label class="form-label">Detalle</label>
            <textarea v-model="form.detalle" class="form-textarea" rows="2" placeholder="Descripción del movimiento" required></textarea>
          </div>
          <div class="form-group ledger-form-wide">
            <label class="form-label">Comprobante (imagen o PDF, opcional)</label>
            <input ref="fileInput" type="file" accept="image/*,application/pdf" class="form-input" @change="onFileChange" />
            <label v-if="editingRow?.receipt_filename" class="ledger-receipt-current">
              <input v-model="removeReceipt" type="checkbox" />
              Eliminar el comprobante actual
              ({{ editingRow.receipt_original_name || 'archivo' }})
            </label>
          </div>
        </div>

        <button type="submit" class="btn-primary ledger-submit-btn" :disabled="isSaving">
          {{ isSaving ? 'Guardando...' : (editingRow ? 'Guardar cambios' : 'Guardar asiento') }}
        </button>
      </form>
    </section>

    <div v-if="isLoading" class="empty-state"><p>Cargando libro diario...</p></div>

    <div v-else-if="rows.length === 0" class="empty-state">
      <p class="empty-state-title">Libro diario vacío</p>
      <p class="empty-state-text">Registra el primer asiento con "+ Nuevo asiento".</p>
    </div>

    <template v-else>
      <dl class="ledger-summary">
        <div class="ledger-summary-item">
          <dt>Asientos</dt>
          <dd>{{ range.total }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Ingresos</dt>
          <dd class="is-in">S/ {{ formatAmount(totals.ingresos) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Egresos</dt>
          <dd class="is-out">S/ {{ formatAmount(totals.egresos) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Neto</dt>
          <dd>S/ {{ formatAmount(totals.ingresos - totals.egresos) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>ITF</dt>
          <dd>S/ {{ formatAmount(totals.itf) }}</dd>
        </div>
      </dl>

      <div v-if="paged.length === 0" class="empty-state">
        <p class="empty-state-title">Ningún asiento coincide</p>
        <p class="empty-state-text">
          Ajusta la búsqueda o los filtros para volver a ver el registro.
        </p>
        <button type="button" class="btn-secondary ledger-submit-btn" @click="clearFilters()">
          Quitar filtros
        </button>
      </div>

      <template v-else>
        <div class="data-table-wrapper ledger-table-wrapper">
          <table class="data-table ledger-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>
                  <button type="button" class="ledger-sort" :class="{ 'is-active': sort.key === 'fecha' }" @click="toggleSort('fecha')">
                    Fecha <span class="ledger-sort-caret">{{ sortCaret('fecha') }}</span>
                  </button>
                </th>
                <th>Detalle</th>
                <th class="ledger-num">
                  <button type="button" class="ledger-sort" :class="{ 'is-active': sort.key === 'monto' }" @click="toggleSort('monto')">
                    Monto <span class="ledger-sort-caret">{{ sortCaret('monto') }}</span>
                  </button>
                </th>
                <th class="ledger-num">ITF</th>
                <th>Banco</th>
                <th>Estado</th>
                <th>Clasificación</th>
                <th>Comprobante</th>
                <th class="ledger-col-actions" aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in paged"
                :key="row.id"
                :class="Number(row.monto) < 0 ? 'ledger-row-out' : 'ledger-row-in'"
              >
                <td class="ledger-code">{{ row.code }}</td>
                <td class="ledger-date">{{ formatDate(row.fecha) }}</td>
                <td>
                  <span class="ledger-detalle" :title="row.detalle">{{ row.detalle }}</span>
                </td>
                <td class="ledger-num">
                  <span class="ledger-amount-cur">{{ currencySymbol(row.moneda) }}</span>
                  <span class="ledger-amount" :class="{ 'is-negative': Number(row.monto) < 0 }">
                    {{ formatAmount(row.monto) }}
                  </span>
                </td>
                <td class="ledger-num">
                  <span v-if="Number(row.itf) > 0">{{ formatAmount(row.itf) }}</span>
                  <span v-else class="ledger-muted">—</span>
                </td>
                <td>{{ row.banco }}</td>
                <td>
                  <span class="pill" :class="row.estado === 'pagado' ? 'pill-success' : 'pill-warning'">{{ row.estado }}</span>
                </td>
                <td>
                  <span v-if="row.area" class="ledger-eyebrow">{{ row.area }}</span>
                  <span class="ledger-stack-main">{{ row.asiento_por_destino || '—' }}</span>
                </td>
                <td>
                  <a
                    v-if="row.receipt_filename"
                    class="receipt-thumb"
                    :href="receiptUrls[row.id] || undefined"
                    target="_blank"
                    rel="noopener"
                    :title="row.receipt_original_name || 'Comprobante'"
                  >
                    <span v-if="!receiptUrls[row.id]" class="receipt-thumb-loading">…</span>
                    <span
                      v-else-if="isPdfReceipt(row.receipt_mime_type, row.receipt_original_name)"
                      class="receipt-thumb-pdf"
                    >PDF</span>
                    <img v-else :src="receiptUrls[row.id]" alt="Comprobante" />
                  </a>
                  <span v-else class="ledger-muted">—</span>
                </td>
                <td class="ledger-col-actions">
                  <div class="ledger-row-actions">
                    <button type="button" class="ledger-icon-btn" title="Editar asiento" aria-label="Editar asiento" @click="startEdit(row)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button type="button" class="ledger-icon-btn is-danger" title="Eliminar asiento" aria-label="Eliminar asiento" @click="removeRow(row.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <LedgerPagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total-pages="totalPages"
          :range="range"
          noun="asientos"
        />
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { apiFetch } from '../../apiClient.js';
import { isPdfReceipt, loadReceiptUrl } from './receiptImage.js';
import { currencySymbol, dayOnly, formatAmount, formatDate } from './format.js';
import { useLedgerTable } from './useLedgerTable.js';
import LedgerPagination from './LedgerPagination.vue';
import './ledger.css';

const BANCOS = ['BCP', 'Interbank', 'Efectivo'];

const isFormOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const rows = ref([]);
const receiptUrls = reactive({});
const fileInput = ref(null);
const editingRow = ref(null);
const removeReceipt = ref(false);
let pendingFile = null;

const {
  search, estado: estadoFilter, banco: bancoFilter, sort, page, pageSize,
  filtered, paged, totalPages, range, toggleSort, sortCaret, clearFilters
} = useLedgerTable(rows, {
  searchText: (row) => [row.code, row.detalle, row.area, row.asiento_por_destino, row.banco]
    .filter(Boolean).join(' '),
  sorters: {
    fecha: (row) => dayOnly(row.fecha),
    monto: (row) => Number(row.monto) || 0
  },
  defaultSort: { key: 'fecha', dir: 'desc' }
});

/**
 * Totales del subconjunto que se está mirando (búsqueda y filtros incluidos),
 * solo sobre los asientos en soles: sumar monedas distintas daría una cifra
 * que no significa nada.
 */
const totals = computed(() => {
  let ingresos = 0;
  let egresos = 0;
  let itf = 0;
  for (const row of filtered.value) {
    if (row.moneda !== 'soles') continue;
    const monto = Number(row.monto) || 0;
    if (monto >= 0) ingresos += monto;
    else egresos += -monto;
    itf += Number(row.itf) || 0;
  }
  return { ingresos, egresos, itf };
});

const itfPreview = computed(() => calcItf(form.monto));

function calcItf(monto) {
  const a = Math.abs(Number(monto) || 0);
  if (a < 1000) return 0;
  return Math.round(Math.floor(a / 1000) * 0.05 * 100) / 100;
}

function emptyForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    detalle: '',
    monto: '',
    moneda: 'soles',
    banco: 'BCP',
    estado: 'pendiente',
    area: '',
    asientoPorDestino: ''
  };
}

const form = reactive(emptyForm());

function onFileChange(event) {
  pendingFile = event.target.files?.[0] || null;
}

function resetForm() {
  Object.assign(form, emptyForm());
  pendingFile = null;
  removeReceipt.value = false;
  if (fileInput.value) fileInput.value.value = '';
}

function openCreate() {
  editingRow.value = null;
  resetForm();
  isFormOpen.value = true;
}

function closeForm() {
  isFormOpen.value = false;
  editingRow.value = null;
  resetForm();
}

/** Abre el formulario con los datos del asiento para editarlo en su sitio. */
function startEdit(row) {
  editingRow.value = row;
  resetForm();
  Object.assign(form, {
    fecha: dayOnly(row.fecha),
    detalle: row.detalle || '',
    monto: row.monto ?? '',
    moneda: row.moneda || 'soles',
    banco: row.banco || 'BCP',
    estado: row.estado || 'pendiente',
    area: row.area || '',
    asientoPorDestino: row.asiento_por_destino || ''
  });
  isFormOpen.value = true;
  errorMessage.value = '';
}

function releaseUrls() {
  for (const key of Object.keys(receiptUrls)) {
    URL.revokeObjectURL(receiptUrls[key]);
    delete receiptUrls[key];
  }
}

function forgetReceiptUrl(id) {
  if (receiptUrls[id]) {
    URL.revokeObjectURL(receiptUrls[id]);
    delete receiptUrls[id];
  }
}

/** Solo se descargan las miniaturas de la página visible. */
async function hydrateReceipts() {
  await Promise.all(paged.value.map(async (row) => {
    if (!row.receipt_filename || receiptUrls[row.id]) return;
    try {
      receiptUrls[row.id] = await loadReceiptUrl(`/api/finance/journal/${row.id}/receipt`);
    } catch { /* la miniatura simplemente no se muestra */ }
  }));
}

watch(paged, hydrateReceipts);

async function fetchRows() {
  isLoading.value = true;
  try {
    const response = await apiFetch('/api/finance/journal');
    const data = await response.json();
    if (response.ok) {
      rows.value = data.journal || [];
      await hydrateReceipts();
    }
  } catch (error) {
    errorMessage.value = 'No se pudo obtener el libro diario.';
  } finally {
    isLoading.value = false;
  }
}

async function submit() {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  const editing = editingRow.value;
  try {
    const fd = new FormData();
    fd.append('fecha', form.fecha);
    fd.append('detalle', form.detalle);
    fd.append('monto', form.monto);
    fd.append('moneda', form.moneda);
    fd.append('banco', form.banco);
    fd.append('estado', form.estado);
    fd.append('area', form.area);
    fd.append('asientoPorDestino', form.asientoPorDestino);
    if (pendingFile) fd.append('receipt', pendingFile);
    if (editing && removeReceipt.value) fd.append('removeReceipt', 'true');

    const response = await apiFetch(
      editing ? `/api/finance/journal/${editing.id}` : '/api/finance/journal',
      { method: editing ? 'PUT' : 'POST', body: fd }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || (editing ? 'No se pudo editar el asiento.' : 'No se pudo registrar el asiento.'));
    }

    // El comprobante pudo cambiar: se descarta la miniatura cacheada del asiento.
    if (editing) forgetReceiptUrl(editing.id);
    successMessage.value = editing
      ? `Asiento ${data.journal?.code || ''} actualizado.`
      : `Asiento ${data.journal?.code || ''} registrado.`;
    setTimeout(() => { successMessage.value = ''; }, 3000);
    closeForm();
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}

async function removeRow(id) {
  if (!confirm('¿Eliminar este asiento? Esta acción no se puede deshacer.')) return;
  try {
    const response = await apiFetch(`/api/finance/journal/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo eliminar el asiento.');
    forgetReceiptUrl(id);
    if (editingRow.value?.id === id) closeForm();
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(fetchRows);
onBeforeUnmount(releaseUrls);
</script>
