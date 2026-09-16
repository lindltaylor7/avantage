<template>
  <section class="ledger-tab">
    <p class="ledger-hint">
      El código se genera automáticamente (AAAAMMDD + correlativo del día) y el ITF se
      calcula con la fórmula <code>|monto|&lt;1000 ? 0 : INT(|monto|/1000)×0.05</code>.
    </p>

    <div class="ledger-controls">
      <label class="ledger-search">
        <span class="ledger-search-icon" aria-hidden="true">🔎</span>
        <input
          v-model="search"
          type="search"
          class="ledger-search-input"
          placeholder="Buscar por código, lead, DNI o tributario"
          aria-label="Buscar ingresos"
        />
      </label>
      <select v-model="estadoFilter" class="ledger-filter" aria-label="Filtrar por estado">
        <option value="">Todo estado</option>
        <option value="pagado">Pagado</option>
        <option value="no pagado">No pagado</option>
      </select>
      <select v-model="bancoFilter" class="ledger-filter" aria-label="Filtrar por banco">
        <option value="">Todo banco</option>
        <option v-for="b in BANCOS" :key="b" :value="b">{{ b }}</option>
      </select>
      <button
        type="button"
        class="btn-primary ledger-add-btn"
        @click="isFormOpen ? closeForm() : openCreate()"
      >
        {{ isFormOpen ? (editingRow ? "✕ Cancelar edición" : "✕ Cerrar") : "+ Registrar ingreso" }}
      </button>
    </div>

    <p v-if="errorMessage" class="info-box ledger-alert">⚠️ {{ errorMessage }}</p>
    <p v-if="successMessage" class="info-box ledger-success">✅ {{ successMessage }}</p>

    <section v-if="isFormOpen" class="glass-panel ledger-form-panel">
      <h3 v-if="editingRow" class="ledger-form-title">
        Editando el ingreso <strong>{{ editingRow.code }}</strong> — los comprobantes y el
        archivo tributario se gestionan desde su fila en la tabla.
      </h3>
      <form class="ledger-form" @submit.prevent="submit">
        <div class="ledger-form-grid">
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input v-model="form.fecha" type="date" class="form-input" required />
          </div>
          <div class="form-group">
            <label class="form-label">Mes</label>
            <input :value="mesPreview" type="text" class="form-input" readonly />
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
              <option v-for="e in EMITIR_OPCIONES" :key="e" :value="e">{{ e }}</option>
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
          <div v-if="!editingRow" class="form-group">
            <label class="form-label">Tributario — archivo o imagen (opcional)</label>
            <input ref="tributarioInput" type="file" class="form-input" @change="onTributarioChange" />
          </div>
          <div v-if="!editingRow" class="form-group ledger-form-wide">
            <label class="form-label">Comprobante (imagen o PDF, opcional)</label>
            <input
              ref="fileInput"
              type="file"
              accept="image/*,application/pdf"
              class="form-input"
              @change="onFileChange"
            />
          </div>
        </div>

        <button type="submit" class="btn-primary ledger-submit-btn" :disabled="isSaving">
          {{ isSaving ? "Guardando..." : editingRow ? "Guardar cambios" : "Guardar ingreso" }}
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

    <template v-else>
      <dl class="ledger-summary">
        <div class="ledger-summary-item">
          <dt>Ingresos</dt>
          <dd>{{ range.total }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Total</dt>
          <dd>S/ {{ formatAmount(totals.total) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Cobrado</dt>
          <dd class="is-in">S/ {{ formatAmount(totals.cobrado) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>Por cobrar</dt>
          <dd class="is-out">S/ {{ formatAmount(totals.total - totals.cobrado) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>ITF</dt>
          <dd>S/ {{ formatAmount(totals.itf) }}</dd>
        </div>
      </dl>

      <div v-if="paged.length === 0" class="empty-state">
        <p class="empty-state-title">Ningún ingreso coincide</p>
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
                <th>Lead</th>
                <th>Cuota</th>
                <th class="ledger-num">
                  <button type="button" class="ledger-sort" :class="{ 'is-active': sort.key === 'monto' }" @click="toggleSort('monto')">
                    Monto <span class="ledger-sort-caret">{{ sortCaret('monto') }}</span>
                  </button>
                </th>
                <th class="ledger-num">ITF</th>
                <th>Banco</th>
                <th>Estado</th>
                <th>Tributario</th>
                <th>Comprobantes</th>
                <th class="ledger-col-actions" aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in paged"
                :key="row.id"
                :class="row.estado === 'pagado' ? 'ledger-row-in' : 'ledger-row-pending'"
              >
                <td class="ledger-code">{{ row.code }}</td>
                <td class="ledger-date">{{ formatDate(row.fecha) }}</td>
                <td>
                  <span class="ledger-stack-main">{{ row.lead_name || "— Sin asociar —" }}</span>
                  <span v-if="row.lead_dni" class="lead-dni">DNI {{ row.lead_dni }}</span>
                </td>
                <td>
                  <span class="ledger-eyebrow">{{ row.emitir }}</span>
                  <span class="ledger-stack-main">{{ row.cuota }}</span>
                </td>
                <td class="ledger-num">
                  <span class="ledger-amount-cur">S/</span>
                  <span class="ledger-amount">{{ formatAmount(row.monto) }}</span>
                </td>
                <td class="ledger-num">
                  <span v-if="Number(row.itf) > 0">{{ formatAmount(row.itf) }}</span>
                  <span v-else class="ledger-muted">—</span>
                </td>
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
                    <span class="ledger-stack-main">{{ row.tributario || "—" }}</span>
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
                        class="tributario-btn"
                        title="Enviar al cliente por correo o WhatsApp"
                        @click="sendModalRow = row"
                      >📤</button>
                      <button
                        v-if="row.tributario_filename"
                        type="button"
                        class="tributario-btn is-danger"
                        title="Eliminar archivo tributario"
                        @click="removeTributarioFile(row.id)"
                      >✕</button>
                      <label
                        class="tributario-btn"
                        :title="row.tributario_filename ? 'Reemplazar archivo' : 'Subir archivo'"
                      >
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
                        <span v-if="isPdfReceipt(rcpt.mime_type, rcpt.original_name)" class="receipt-thumb-pdf">PDF</span>
                        <img v-else :src="receiptUrls[rcpt.id]" alt="Comprobante" />
                      </a>
                      <span v-else class="receipt-thumb-loading">…</span>
                      <button
                        type="button"
                        class="receipt-remove"
                        title="Eliminar comprobante"
                        @click="removeReceipt(rcpt.id)"
                      >✕</button>
                    </span>
                    <label class="receipt-add" title="Agregar comprobante (imagen o PDF)">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        hidden
                        @change="(e) => uploadReceipt(row.id, e)"
                      />
                      +
                    </label>
                  </div>
                </td>
                <td class="ledger-col-actions">
                  <div class="ledger-row-actions">
                    <button type="button" class="ledger-icon-btn" title="Editar ingreso" aria-label="Editar ingreso" @click="startEdit(row)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button type="button" class="ledger-icon-btn is-danger" title="Eliminar ingreso" aria-label="Eliminar ingreso" @click="removeRow(row.id)">
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
          noun="ingresos"
        />
      </template>
    </template>

    <SendTributarioModal v-if="sendModalRow" :income="sendModalRow" @close="sendModalRow = null" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { apiFetch } from "../../apiClient.js";
import { isPdfReceipt, loadReceiptUrl } from "./receiptImage.js";
import { dayOnly, formatAmount, formatDate } from "./format.js";
import { useLedgerTable } from "./useLedgerTable.js";
import LedgerPagination from "./LedgerPagination.vue";
import SendTributarioModal from "./SendTributarioModal.vue";
import "./ledger.css";

const CUOTAS = ["1era", "2da", "3era"];
const EMITIR_OPCIONES = ["factura", "boleta", "nrus", "rxh", "c. interno"];
const BANCOS = ["BCP", "Interbank", "Efectivo"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
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
const editingRow = ref(null);
let pendingFile = null;
let pendingTributarioFile = null;

const {
  search, estado: estadoFilter, banco: bancoFilter, sort, page, pageSize,
  filtered, paged, totalPages, range, toggleSort, sortCaret, clearFilters
} = useLedgerTable(rows, {
  searchText: (row) => [row.code, row.lead_name, row.lead_dni, row.cuota, row.emitir, row.tributario, row.banco]
    .filter(Boolean).join(" "),
  sorters: {
    fecha: (row) => dayOnly(row.fecha),
    monto: (row) => Number(row.monto) || 0,
  },
  defaultSort: { key: "fecha", dir: "desc" },
});

/** Totales del subconjunto que se está mirando (búsqueda y filtros incluidos). */
const totals = computed(() => {
  let total = 0;
  let cobrado = 0;
  let itf = 0;
  for (const row of filtered.value) {
    const monto = Number(row.monto) || 0;
    total += monto;
    if (row.estado === "pagado") cobrado += monto;
    itf += Number(row.itf) || 0;
  }
  return { total, cobrado, itf };
});

function emptyForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    leadId: null,
    cuota: "1era",
    emitir: "factura",
    monto: "",
    banco: "BCP",
    estado: "no pagado",
    tributario: "",
  };
}

const form = reactive(emptyForm());

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

function onFileChange(event) {
  pendingFile = event.target.files?.[0] || null;
}

function onTributarioChange(event) {
  pendingTributarioFile = event.target.files?.[0] || null;
}

function resetForm() {
  Object.assign(form, emptyForm());
  pendingFile = null;
  pendingTributarioFile = null;
  if (fileInput.value) fileInput.value.value = "";
  if (tributarioInput.value) tributarioInput.value.value = "";
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

/** Abre el formulario con los datos del ingreso para editarlo en su sitio. */
function startEdit(row) {
  editingRow.value = row;
  resetForm();
  Object.assign(form, {
    fecha: dayOnly(row.fecha),
    leadId: row.lead_id ?? null,
    cuota: row.cuota || "1era",
    emitir: row.emitir || "factura",
    monto: row.monto ?? "",
    banco: row.banco || "BCP",
    estado: row.estado || "no pagado",
    tributario: row.tributario || "",
  });
  isFormOpen.value = true;
  errorMessage.value = "";
}

function releaseUrls() {
  for (const map of [receiptUrls, tributarioUrls]) {
    for (const key of Object.keys(map)) {
      URL.revokeObjectURL(map[key]);
      delete map[key];
    }
  }
}

/** Solo se descargan las miniaturas y enlaces de la página visible. */
async function hydrateReceipts() {
  await Promise.all(paged.value.map(async (row) => {
    await Promise.all((row.receipts || []).map(async (rcpt) => {
      if (receiptUrls[rcpt.id]) return;
      try {
        receiptUrls[rcpt.id] = await loadReceiptUrl(`/api/finance/receipts/${rcpt.id}`);
      } catch { /* la miniatura simplemente no se muestra */ }
    }));
    if (row.tributario_filename && !tributarioUrls[row.id]) {
      try {
        tributarioUrls[row.id] = await loadReceiptUrl(`/api/finance/income/${row.id}/tributario`);
      } catch { /* el enlace simplemente no se muestra */ }
    }
  }));
}

watch(paged, hydrateReceipts);

async function fetchLeads() {
  try {
    const response = await apiFetch("/api/finance/leads-directory");
    const data = await response.json();
    if (response.ok) leads.value = data.leads || [];
  } catch {
    /* el selector queda vacío */
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
  const editing = editingRow.value;
  try {
    const response = await apiFetch(
      editing ? `/api/finance/income/${editing.id}` : "/api/finance/income",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error ||
          (editing ? "No se pudo editar el ingreso." : "No se pudo registrar el ingreso."),
      );
    }

    if (pendingFile && data.income?.id) {
      const fd = new FormData();
      fd.append("receipt", pendingFile);
      await apiFetch(`/api/finance/income/${data.income.id}/receipts`, { method: "POST", body: fd });
    }

    if (pendingTributarioFile && data.income?.id) {
      const fd = new FormData();
      fd.append("file", pendingTributarioFile);
      await apiFetch(`/api/finance/income/${data.income.id}/tributario`, { method: "POST", body: fd });
    }

    successMessage.value = editing
      ? `Ingreso ${data.income?.code || ""} actualizado.`
      : `Ingreso ${data.income?.code || ""} registrado.`;
    setTimeout(() => {
      successMessage.value = "";
    }, 3000);
    closeForm();
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
    const response = await apiFetch(`/api/finance/income/${incomeId}/receipts`, {
      method: "POST",
      body: fd,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo subir el comprobante.");
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function removeReceipt(receiptId) {
  if (!confirm("¿Eliminar este comprobante?")) return;
  try {
    const response = await apiFetch(`/api/finance/receipts/${receiptId}`, { method: "DELETE" });
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
    const response = await apiFetch(`/api/finance/income/${incomeId}/tributario`, {
      method: "POST",
      body: fd,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo subir el archivo tributario.");
    forgetTributarioUrl(incomeId);
    await fetchRows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function removeTributarioFile(incomeId) {
  if (!confirm("¿Eliminar el archivo tributario de este ingreso?")) return;
  try {
    const response = await apiFetch(`/api/finance/income/${incomeId}/tributario`, {
      method: "DELETE",
    });
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
    if (!response.ok) throw new Error(data.error || "No se pudo actualizar el estado.");
    row.estado = data.income?.estado ?? nextEstado;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    estadoSaving.value = null;
  }
}

async function removeRow(id) {
  if (!confirm("¿Eliminar este ingreso y sus comprobantes? Esta acción no se puede deshacer.")) {
    return;
  }
  try {
    const response = await apiFetch(`/api/finance/income/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("No se pudo eliminar el ingreso.");
    if (editingRow.value?.id === id) closeForm();
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
.lead-dni {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
}

.tributario-cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 150px;
}

.tributario-file {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tributario-link {
  font-size: 0.7rem;
  color: var(--primary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tributario-btn {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tributario-btn:hover {
  color: var(--text-main);
  border-color: var(--primary);
}

.tributario-btn.is-danger:hover {
  color: #fff;
  background: var(--accent-rose);
  border-color: var(--accent-rose);
}

.pill-toggle {
  cursor: pointer;
  text-transform: capitalize;
  font: inherit;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
}

.pill-toggle:hover {
  filter: brightness(0.97);
}

.pill-toggle:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
