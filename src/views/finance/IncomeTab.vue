<template>
  <section class="ledger-tab">
    <div class="ledger-toolbar">
      <p class="ledger-hint">
        El código se genera automáticamente (AAAAMMDD + correlativo del día) y
        el ITF se calcula con la fórmula
        <code>|monto|&lt;1000 ? 0 : INT(|monto|/1000)×0.05</code>.
      </p>
      <button
        type="button"
        class="btn-primary ledger-add-btn"
        @click="isFormOpen = !isFormOpen"
      >
        {{ isFormOpen ? "✕ Cerrar" : "+ Registrar ingreso" }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">
      ⚠️ {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="info-box ledger-success">
      ✅ {{ successMessage }}
    </p>

    <section v-if="isFormOpen" class="glass-panel ledger-form-panel">
      <form class="ledger-form" @submit.prevent="submit">
        <div class="ledger-form-grid">
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input
              v-model="form.fecha"
              type="date"
              class="form-input"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">Mes</label>
            <input
              :value="mesPreview"
              type="text"
              class="form-input"
              readonly
            />
          </div>
          <div class="form-group">
            <label class="form-label">Lead</label>
            <select v-model="form.leadId" class="form-select">
              <option :value="null">— Sin asociar —</option>
              <option v-for="lead in leads" :key="lead.id" :value="lead.id">
                {{ lead.name }}{{ lead.dni ? ` · DNI ${lead.dni}` : "" }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cuota</label>
            <select v-model="form.cuota" class="form-select" required>
              <option v-for="c in CUOTAS" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Emitir</label>
            <select v-model="form.emitir" class="form-select" required>
              <option v-for="e in EMITIR_OPCIONES" :key="e" :value="e">
                {{ e }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Monto (S/)</label>
            <input
              v-model="form.monto"
              type="number"
              step="0.01"
              min="0.01"
              class="form-input"
              placeholder="0.00"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label">ITF (calculado)</label>
            <input
              :value="formatAmount(itfPreview)"
              type="text"
              class="form-input"
              readonly
            />
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
              <option value="no pagado">No pagado</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tributario</label>
            <input
              v-model="form.tributario"
              type="text"
              class="form-input"
              list="income-tributario"
              placeholder="Ej: Renta 4ta, IGV..."
            />
            <datalist id="income-tributario">
              <option value="Renta 3ra" />
              <option value="Renta 4ta" />
              <option value="IGV" />
              <option value="No aplica" />
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label">Tributario — archivo o imagen (opcional)</label>
            <input
              ref="tributarioInput"
              type="file"
              class="form-input"
              @change="onTributarioChange"
            />
          </div>
          <div class="form-group ledger-form-wide">
            <label class="form-label">Comprobante (imagen, opcional)</label>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="form-input"
              @change="onFileChange"
            />
          </div>
        </div>

        <button
          type="submit"
          class="btn-primary ledger-submit-btn"
          :disabled="isSaving"
        >
          {{ isSaving ? "Guardando..." : "Guardar ingreso" }}
        </button>
      </form>
    </section>

    <div v-if="isLoading" class="empty-state"><p>Cargando ingresos...</p></div>
    <div v-else-if="rows.length === 0" class="empty-state">
      <p class="empty-state-title">Sin ingresos registrados</p>
      <p class="empty-state-text">
        Usa "+ Registrar ingreso" para anotar la primera cuota cobrada.
      </p>
    </div>
    <div v-else class="data-table-wrapper ledger-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Mes</th>
            <th>Fecha</th>
            <th>Lead</th>
            <th>Cuota</th>
            <th>Emitir</th>
            <th>Monto</th>
            <th>ITF</th>
            <th>Banco</th>
            <th>Estado</th>
            <th>Tributario</th>
            <th>Comprobantes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="data-mono">{{ row.code }}</td>
            <td class="ledger-cap">{{ row.mes }}</td>
            <td class="data-mono">{{ formatDate(row.fecha) }}</td>
            <td>
              <span>{{ row.lead_name || "—" }}</span>
              <span v-if="row.lead_dni" class="lead-dni">DNI {{ row.lead_dni }}</span>
            </td>
            <td>{{ row.cuota }}</td>
            <td>{{ row.emitir }}</td>
            <td class="data-mono">S/ {{ formatAmount(row.monto) }}</td>
            <td class="data-mono">S/ {{ formatAmount(row.itf) }}</td>
            <td>{{ row.banco }}</td>
            <td>
              <button
                type="button"
                class="pill pill-toggle"
                :class="row.estado === 'pagado' ? 'pill-success' : 'pill-warning'"
                :disabled="estadoSaving === row.id"
                title="Clic para cambiar el estado"
                @click="toggleEstado(row)"
              >
                {{ row.estado }}
              </button>
            </td>
            <td>
              <div class="tributario-cell">
                <span>{{ row.tributario || "—" }}</span>
                <div class="tributario-file">
                  <a
                    v-if="row.tributario_filename && tributarioUrls[row.id]"
                    :href="tributarioUrls[row.id]"
                    target="_blank"
                    rel="noopener"
                    class="tributario-link"
                    :title="row.tributario_original_name || 'Archivo tributario'"
                  >📎 {{ row.tributario_original_name || "ver archivo" }}</a>
                  <span v-else-if="row.tributario_filename" class="tributario-link">📎 …</span>
                  <button
                    v-if="row.tributario_filename"
                    type="button"
                    class="tributario-send"
                    title="Enviar al cliente por correo o WhatsApp"
                    @click="sendModalRow = row"
                  >📤</button>
                  <button
                    v-if="row.tributario_filename"
                    type="button"
                    class="tributario-remove"
                    title="Eliminar archivo tributario"
                    @click="removeTributarioFile(row.id)"
                  >✕</button>
                  <label class="tributario-add" :title="row.tributario_filename ? 'Reemplazar archivo' : 'Subir archivo'">
                    <input type="file" hidden @change="(e) => uploadTributarioFile(row.id, e)" />
                    {{ row.tributario_filename ? "↻" : "+" }}
                  </label>
                </div>
              </div>
            </td>
            <td>
              <div class="receipt-cell">
                <span
                  v-for="rcpt in row.receipts"
                  :key="rcpt.id"
                  class="receipt-thumb"
                  :title="rcpt.original_name || 'Comprobante'"
                >
                  <a
                    v-if="receiptUrls[rcpt.id]"
                    :href="receiptUrls[rcpt.id]"
                    target="_blank"
                    rel="noopener"
                    class="receipt-thumb-link"
                  >
                    <img :src="receiptUrls[rcpt.id]" alt="Comprobante" />
                  </a>
                  <span v-else class="receipt-thumb-loading">…</span>
                  <button
                    type="button"
                    class="receipt-remove"
                    title="Eliminar comprobante"
                    @click="removeReceipt(rcpt.id)"
                  >
                    ✕
                  </button>
                </span>
                <label class="receipt-add" title="Agregar comprobante">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    @change="(e) => uploadReceipt(row.id, e)"
                  />
                  +
                </label>
              </div>
            </td>
            <td>
              <button
                type="button"
                class="btn-secondary ledger-delete-btn"
                @click="removeRow(row.id)"
              >
                🗑️
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <SendTributarioModal
      v-if="sendModalRow"
      :income="sendModalRow"
      @close="sendModalRow = null"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { apiFetch } from "../../apiClient.js";
import { loadReceiptUrl } from "./receiptImage.js";
import SendTributarioModal from "./SendTributarioModal.vue";

const CUOTAS = ["1era", "2da", "3era"];
const EMITIR_OPCIONES = ["factura", "boleta", "nrus", "rxh", "c. interno"];
const BANCOS = ["BCP", "Interbank", "Efectivo"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const isFormOpen = ref(false);
const isSaving = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const rows = ref([]);
const leads = ref([]);
const receiptUrls = reactive({});
const tributarioUrls = reactive({});
const fileInput = ref(null);
const tributarioInput = ref(null);
const estadoSaving = ref(null);
const sendModalRow = ref(null);
let pendingFile = null;
let pendingTributarioFile = null;

const form = reactive({
  fecha: new Date().toISOString().slice(0, 10),
  leadId: null,
  cuota: "1era",
  emitir: "factura",
  monto: "",
  banco: "BCP",
  estado: "no pagado",
  tributario: "",
});

const mesPreview = computed(() => {
  if (!form.fecha) return "";
  return MESES[Number(form.fecha.slice(5, 7)) - 1] || "";
});

const itfPreview = computed(() => calcItf(form.monto));

function calcItf(monto) {
  const a = Math.abs(Number(monto) || 0);
  if (a < 1000) return 0;
  return Math.round(Math.floor(a / 1000) * 0.05 * 100) / 100;
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function onFileChange(event) {
  pendingFile = event.target.files?.[0] || null;
}

function onTributarioChange(event) {
  pendingTributarioFile = event.target.files?.[0] || null;
}

function releaseUrls() {
  for (const map of [receiptUrls, tributarioUrls]) {
    for (const key of Object.keys(map)) {
      URL.revokeObjectURL(map[key]);
      delete map[key];
    }
  }
}

async function hydrateReceipts() {
  for (const row of rows.value) {
    for (const rcpt of row.receipts || []) {
      if (receiptUrls[rcpt.id]) continue;
      try {
        receiptUrls[rcpt.id] = await loadReceiptUrl(
          `/api/finance/receipts/${rcpt.id}`,
        );
      } catch {
        /* miniatura simplemente no se muestra */
      }
    }
    if (row.tributario_filename && !tributarioUrls[row.id]) {
      try {
        tributarioUrls[row.id] = await loadReceiptUrl(
          `/api/finance/income/${row.id}/tributario`,
        );
      } catch {
        /* el enlace simplemente no se muestra */
      }
    }
  }
}

async function fetchLeads() {
  try {
    const response = await apiFetch("/api/finance/leads-directory");
    const data = await response.json();
    if (response.ok) leads.value = data.leads || [];
  } catch {
    /* selector queda vacío */
  }
}

async function fetchRows() {
  isLoading.value = true;
  try {
    const response = await apiFetch("/api/finance/income");
    const data = await response.json();
    if (response.ok) {
      rows.value = data.income || [];
      await hydrateReceipts();
    }
  } catch (error) {
    errorMessage.value = "No se pudieron obtener los ingresos.";
  } finally {
    isLoading.value = false;
  }
}

async function submit() {
  isSaving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const response = await apiFetch("/api/finance/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo registrar el ingreso.");

    if (pendingFile && data.income?.id) {
      const fd = new FormData();
      fd.append("receipt", pendingFile);
      await apiFetch(`/api/finance/income/${data.income.id}/receipts`, {
        method: "POST",
        body: fd,
      });
    }

    if (pendingTributarioFile && data.income?.id) {
      const fd = new FormData();
      fd.append("file", pendingTributarioFile);
      await apiFetch(`/api/finance/income/${data.income.id}/tributario`, {
        method: "POST",
        body: fd,
      });
    }

    form.monto = "";
    form.tributario = "";
    pendingFile = null;
    pendingTributarioFile = null;
    if (fileInput.value) fileInput.value.value = "";
    if (tributarioInput.value) tributarioInput.value.value = "";
    successMessage.value = `Ingreso ${data.income?.code || ""} registrado.`;
    setTimeout(() => {
      successMessage.value = "";
    }, 3000);
    isFormOpen.value = false;
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}

async function uploadReceipt(incomeId, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  errorMessage.value = "";
  try {
    const fd = new FormData();
    fd.append("receipt", file);
    const response = await apiFetch(
      `/api/finance/income/${incomeId}/receipts`,
      { method: "POST", body: fd },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo subir el comprobante.");
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function removeReceipt(receiptId) {
  if (!confirm("¿Eliminar este comprobante?")) return;
  try {
    const response = await apiFetch(`/api/finance/receipts/${receiptId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("No se pudo eliminar el comprobante.");
    if (receiptUrls[receiptId]) {
      URL.revokeObjectURL(receiptUrls[receiptId]);
      delete receiptUrls[receiptId];
    }
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function forgetTributarioUrl(incomeId) {
  if (tributarioUrls[incomeId]) {
    URL.revokeObjectURL(tributarioUrls[incomeId]);
    delete tributarioUrls[incomeId];
  }
}

async function uploadTributarioFile(incomeId, event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  errorMessage.value = "";
  try {
    const fd = new FormData();
    fd.append("file", file);
    const response = await apiFetch(
      `/api/finance/income/${incomeId}/tributario`,
      { method: "POST", body: fd },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo subir el archivo tributario.");
    forgetTributarioUrl(incomeId);
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function removeTributarioFile(incomeId) {
  if (!confirm("¿Eliminar el archivo tributario de este ingreso?")) return;
  try {
    const response = await apiFetch(
      `/api/finance/income/${incomeId}/tributario`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error("No se pudo eliminar el archivo tributario.");
    forgetTributarioUrl(incomeId);
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function toggleEstado(row) {
  const nextEstado = row.estado === "pagado" ? "no pagado" : "pagado";
  estadoSaving.value = row.id;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/income/${row.id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nextEstado }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "No se pudo actualizar el estado.");
    row.estado = data.income?.estado ?? nextEstado;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    estadoSaving.value = null;
  }
}

async function removeRow(id) {
  if (
    !confirm(
      "¿Eliminar este ingreso y sus comprobantes? Esta acción no se puede deshacer.",
    )
  )
    return;
  try {
    const response = await apiFetch(`/api/finance/income/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("No se pudo eliminar el ingreso.");
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(() => {
  fetchLeads();
  fetchRows();
});

onBeforeUnmount(releaseUrls);
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

.ledger-hint code {
  font-size: 0.76rem;
  background: var(--surface-2);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.ledger-add-btn {
  width: auto;
  padding: 0.55rem 1.1rem;
  flex-shrink: 0;
}

.ledger-alert {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
}
.ledger-success {
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
}

.ledger-form-panel {
  padding: 1.5rem;
}

.ledger-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.ledger-form-grid .form-group {
  margin-bottom: 0;
}
.ledger-form-wide {
  grid-column: 1 / -1;
}

.ledger-submit-btn {
  width: auto;
  padding: 0.6rem 1.5rem;
  margin-top: 1.25rem;
}

.ledger-table-wrapper {
  overflow-x: auto;
}
.ledger-cap {
  text-transform: capitalize;
}

.ledger-delete-btn {
  padding: 0.3rem 0.55rem;
  font-size: 0.8rem;
}

.lead-dni {
  display: block;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.tributario-cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tributario-file {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.tributario-link {
  font-size: 0.72rem;
  color: var(--primary);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tributario-remove,
.tributario-add,
.tributario-send {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tributario-add:hover,
.tributario-send:hover {
  color: var(--text-main);
  border-color: var(--primary);
}

.tributario-remove:hover {
  color: #fff;
  background: var(--accent-rose);
  border-color: var(--accent-rose);
}

.pill-toggle {
  cursor: pointer;
  text-transform: capitalize;
  font: inherit;
  font-size: 0.75rem;
}

.pill-toggle:hover {
  filter: brightness(0.97);
}

.pill-toggle:disabled {
  opacity: 0.6;
  cursor: wait;
}

.receipt-cell {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.receipt-thumb {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
}

.receipt-thumb-link {
  display: block;
  width: 100%;
  height: 100%;
}
.receipt-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.receipt-thumb-loading {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.receipt-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: var(--accent-rose);
  color: #fff;
  font-size: 0.6rem;
  line-height: 1;
  cursor: pointer;
  display: none;
}

.receipt-thumb:hover .receipt-remove {
  display: block;
}

.receipt-add {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: var(--text-muted);
  cursor: pointer;
}

.receipt-add:hover {
  color: var(--text-main);
  border-color: var(--primary);
}
</style>
