<template>
  <section class="ledger-tab">
    <div class="ledger-toolbar">
      <p class="ledger-hint">
        Código autogenerado por día. El monto admite valores negativos y el ITF se calcula
        sobre su valor absoluto.
      </p>
      <button type="button" class="btn-primary ledger-add-btn" @click="isFormOpen = !isFormOpen">
        {{ isFormOpen ? '✕ Cerrar' : '+ Nuevo asiento' }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>
    <p v-if="successMessage" class="info-box ledger-success">✅ {{ successMessage }}</p>

    <section v-if="isFormOpen" class="glass-panel ledger-form-panel">
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
            <label class="form-label">Comprobante (imagen, opcional)</label>
            <input ref="fileInput" type="file" accept="image/*" class="form-input" @change="onFileChange" />
          </div>
        </div>

        <button type="submit" class="btn-primary ledger-submit-btn" :disabled="isSaving">
          {{ isSaving ? 'Guardando...' : 'Guardar asiento' }}
        </button>
      </form>
    </section>

    <div v-if="isLoading" class="empty-state"><p>Cargando libro diario...</p></div>
    <div v-else-if="rows.length === 0" class="empty-state">
      <p class="empty-state-title">Libro diario vacío</p>
      <p class="empty-state-text">Registra el primer asiento con "+ Nuevo asiento".</p>
    </div>
    <div v-else class="data-table-wrapper ledger-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th><th>Fecha</th><th>Detalle</th><th>Monto</th><th>Moneda</th><th>ITF</th>
            <th>Banco</th><th>Estado</th><th>Área</th><th>Asiento por destino</th><th>Comprobante</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="data-mono">{{ row.code }}</td>
            <td class="data-mono">{{ formatDate(row.fecha) }}</td>
            <td class="ledger-detalle">{{ row.detalle }}</td>
            <td class="data-mono" :class="Number(row.monto) < 0 ? 'amount-negative' : 'amount-positive'">
              {{ formatAmount(row.monto) }}
            </td>
            <td class="ledger-cap">{{ row.moneda }}</td>
            <td class="data-mono">{{ formatAmount(row.itf) }}</td>
            <td>{{ row.banco }}</td>
            <td>
              <span class="pill" :class="row.estado === 'pagado' ? 'pill-success' : 'pill-warning'">{{ row.estado }}</span>
            </td>
            <td>{{ row.area || '—' }}</td>
            <td>{{ row.asiento_por_destino || '—' }}</td>
            <td>
              <a
                v-if="row.receipt_filename"
                class="receipt-thumb"
                :href="receiptUrls[row.id] || undefined"
                target="_blank"
                rel="noopener"
                :title="row.receipt_original_name || 'Comprobante'"
              >
                <img v-if="receiptUrls[row.id]" :src="receiptUrls[row.id]" alt="Comprobante" />
                <span v-else class="receipt-thumb-loading">…</span>
              </a>
              <span v-else>—</span>
            </td>
            <td>
              <button type="button" class="btn-secondary ledger-delete-btn" @click="removeRow(row.id)">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { apiFetch } from '../../apiClient.js';
import { loadReceiptUrl } from './receiptImage.js';

const BANCOS = ['BCP', 'Interbank', 'Efectivo'];

const isFormOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const rows = ref([]);
const receiptUrls = reactive({});
const fileInput = ref(null);
let pendingFile = null;

const form = reactive({
  fecha: new Date().toISOString().slice(0, 10),
  detalle: '',
  monto: '',
  moneda: 'soles',
  banco: 'BCP',
  estado: 'pendiente',
  area: '',
  asientoPorDestino: ''
});

const itfPreview = computed(() => calcItf(form.monto));

function calcItf(monto) {
  const a = Math.abs(Number(monto) || 0);
  if (a < 1000) return 0;
  return Math.round(Math.floor(a / 1000) * 0.05 * 100) / 100;
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function onFileChange(event) {
  pendingFile = event.target.files?.[0] || null;
}

function releaseUrls() {
  for (const key of Object.keys(receiptUrls)) {
    URL.revokeObjectURL(receiptUrls[key]);
    delete receiptUrls[key];
  }
}

async function hydrateReceipts() {
  for (const row of rows.value) {
    if (!row.receipt_filename || receiptUrls[row.id]) continue;
    try {
      receiptUrls[row.id] = await loadReceiptUrl(`/api/finance/journal/${row.id}/receipt`);
    } catch { /* miniatura simplemente no se muestra */ }
  }
}

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

    const response = await apiFetch('/api/finance/journal', { method: 'POST', body: fd });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo registrar el asiento.');

    form.detalle = '';
    form.monto = '';
    form.area = '';
    form.asientoPorDestino = '';
    pendingFile = null;
    if (fileInput.value) fileInput.value.value = '';
    successMessage.value = `Asiento ${data.journal?.code || ''} registrado.`;
    setTimeout(() => { successMessage.value = ''; }, 3000);
    isFormOpen.value = false;
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
    if (receiptUrls[id]) {
      URL.revokeObjectURL(receiptUrls[id]);
      delete receiptUrls[id];
    }
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(fetchRows);
onBeforeUnmount(releaseUrls);
</script>

<style scoped>
.ledger-tab { display: flex; flex-direction: column; gap: 1rem; }

.ledger-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.ledger-hint { font-size: 0.8rem; color: var(--text-muted); max-width: 640px; margin: 0; }
.ledger-add-btn { width: auto; padding: 0.55rem 1.1rem; flex-shrink: 0; }

.ledger-alert { border-color: rgba(200, 85, 50, 0.4); color: var(--accent-rose); }
.ledger-success { border-color: rgba(46, 125, 70, 0.4); color: var(--accent-emerald); }

.ledger-form-panel { padding: 1.5rem; }

.ledger-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.ledger-form-grid .form-group { margin-bottom: 0; }
.ledger-form-wide { grid-column: 1 / -1; }

.ledger-submit-btn { width: auto; padding: 0.6rem 1.5rem; margin-top: 1.25rem; }

.ledger-table-wrapper { overflow-x: auto; }
.ledger-cap { text-transform: capitalize; }
.ledger-detalle { max-width: 240px; }

.amount-positive { color: var(--accent-emerald); font-weight: 600; }
.amount-negative { color: var(--accent-rose); font-weight: 600; }

.ledger-delete-btn { padding: 0.3rem 0.55rem; font-size: 0.8rem; }

.receipt-thumb {
  display: inline-flex;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
}

.receipt-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.receipt-thumb-loading { font-size: 0.8rem; color: var(--text-muted); }
</style>
