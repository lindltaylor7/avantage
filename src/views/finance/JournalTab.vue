<template>
  <section class="ledger-tab">
    <div class="ledger-toolbar">
      <p class="ledger-hint">
        Código autogenerado por día. El monto admite valores negativos y el ITF se calcula
        sobre su valor absoluto.
      </p>
      <button type="button" class="btn-primary ledger-add-btn" @click="isFormOpen ? closeForm() : openCreate()">
        {{ isFormOpen ? (editingRow ? '✕ Cancelar edición' : '✕ Cerrar') : '+ Nuevo asiento' }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>
    <p v-if="successMessage" class="info-box ledger-success">✅ {{ successMessage }}</p>

    <section v-if="isFormOpen" class="glass-panel ledger-form-panel">
      <h3 v-if="editingRow" class="ledger-form-title">Editando el asiento {{ editingRow.code }}</h3>
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
                <span v-if="!receiptUrls[row.id]" class="receipt-thumb-loading">…</span>
                <span
                  v-else-if="isPdfReceipt(row.receipt_mime_type, row.receipt_original_name)"
                  class="receipt-thumb-pdf"
                >📄</span>
                <img v-else :src="receiptUrls[row.id]" alt="Comprobante" />
              </a>
              <span v-else>—</span>
            </td>
            <td>
              <div class="ledger-row-actions">
                <button type="button" class="btn-secondary ledger-delete-btn" title="Editar asiento" @click="startEdit(row)">✏️</button>
                <button type="button" class="btn-secondary ledger-delete-btn" title="Eliminar asiento" @click="removeRow(row.id)">🗑️</button>
              </div>
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
import { isPdfReceipt, loadReceiptUrl } from './receiptImage.js';

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
    fecha: row.fecha ? String(row.fecha).slice(0, 10) : '',
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

function forgetReceiptUrl(id) {
  if (receiptUrls[id]) {
    URL.revokeObjectURL(receiptUrls[id]);
    delete receiptUrls[id];
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
.ledger-form-title { margin: 0 0 1rem; font-size: 0.95rem; color: var(--text-muted); }

.ledger-receipt-current {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  cursor: pointer;
}

.ledger-receipt-current input { width: auto; margin: 0; }

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
.ledger-row-actions { display: flex; gap: 0.3rem; }

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
.receipt-thumb-pdf { font-size: 1.2rem; line-height: 1; }
</style>
