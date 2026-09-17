<template>
  <section class="ledger-tab">
    <p class="ledger-hint">
      Cada bloque es un <strong>cierre</strong>: el precio total del trato, cuánto se lleva
      cubierto y, debajo, sus cuotas. El código se genera automáticamente (AAAAMMDD +
      correlativo del día) y el ITF con la fórmula
      <code>|monto|&lt;1000 ? 0 : INT(|monto|/1000)×0.05</code>. Una cuota recorre
      <strong>pendiente → pagado</strong> (al adjuntar el comprobante)
      <strong>→ verificado</strong>; solo lo verificado suma en las cifras de Finanzas y,
      si es el primer pago de un proyecto, lo activa.
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
        <option value="pendiente">Pendiente</option>
        <option value="pagado">Pagado (por verificar)</option>
        <option value="verificado">Verificado</option>
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
          <div class="form-group ledger-form-wide">
            <label class="form-label">Lead</label>
            <select v-model="form.leadId" class="form-select">
              <option :value="null">— Sin asociar —</option>
              <option v-for="lead in leads" :key="lead.id" :value="lead.id">
                {{ lead.name }}{{ lead.dni ? ` · DNI ${lead.dni}` : "" }}
              </option>
            </select>
            <div v-if="selectedLead" class="lead-total-box">
              <template v-if="editingTotal">
                <input
                  v-model="totalAmountDraft"
                  type="number"
                  step="0.01"
                  min="0.01"
                  class="form-input lead-total-input"
                  placeholder="Precio total (S/)"
                />
                <button type="button" class="btn-secondary lead-total-btn" @click="saveTotalAmount">Guardar</button>
                <button type="button" class="btn-secondary lead-total-btn" @click="editingTotal = false">Cancelar</button>
              </template>
              <template v-else>
                <span v-if="selectedLead.total_amount != null">
                  Precio total: <strong>S/ {{ formatAmount(selectedLead.total_amount) }}</strong>
                  · Registrado: S/ {{ formatAmount(selectedLead.registered_amount) }}
                  · Saldo: <strong :class="{ 'is-out': selectedLead.balance_amount > 0 }">
                    S/ {{ formatAmount(selectedLead.balance_amount) }}
                  </strong>
                </span>
                <span v-else class="ledger-muted">Este lead no tiene un precio total registrado.</span>
                <button type="button" class="lead-total-edit-btn" @click="startEditTotal">✎ editar precio total</button>
              </template>
            </div>
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
            <select v-model="form.estado" class="form-select" :disabled="editingRow?.estado === 'verificado'">
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
            <p v-if="editingRow?.estado === 'verificado'" class="ledger-receipt-hint">
              Ingreso verificado: usa el botón ✓ de su fila para quitar la verificación.
            </p>
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
            <label class="form-label">Comprobantes (imágenes o PDF, opcional)</label>
            <input
              ref="fileInput"
              type="file"
              accept="image/*,application/pdf"
              multiple
              class="form-input"
              @change="onFileChange"
            />
            <p class="ledger-receipt-hint">
              Puedes seleccionar varios archivos a la vez (hasta {{ MAX_RECEIPTS }}).
            </p>
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
        <div class="ledger-summary-item" title="Leads con cuotas registradas">
          <dt>Cierres</dt>
          <dd>{{ range.total }}</dd>
        </div>
        <div class="ledger-summary-item" title="Suma de los precios totales de los cierres">
          <dt>Precio total</dt>
          <dd>S/ {{ formatAmount(totals.precioTotal) }}</dd>
        </div>
        <div class="ledger-summary-item" title="Suma de las cuotas ya registradas, en cualquier estado">
          <dt>Registrado</dt>
          <dd>S/ {{ formatAmount(totals.registrado) }}</dd>
        </div>
        <div class="ledger-summary-item" title="Verificado por Finanzas: es lo único que suma en las cifras del módulo">
          <dt>Verificado</dt>
          <dd class="is-in">S/ {{ formatAmount(totals.verificado) }}</dd>
        </div>
        <div class="ledger-summary-item" title="Cobrado pero a la espera del visto bueno de Finanzas">
          <dt>Por verificar</dt>
          <dd class="is-pending">S/ {{ formatAmount(totals.porVerificar) }}</dd>
        </div>
        <div class="ledger-summary-item" title="Lo que falta del precio total: cuotas pendientes más lo que ni siquiera se ha registrado">
          <dt>Por cobrar</dt>
          <dd class="is-out">S/ {{ formatAmount(totals.porCobrar) }}</dd>
        </div>
        <div class="ledger-summary-item">
          <dt>ITF</dt>
          <dd>S/ {{ formatAmount(totals.itf) }}</dd>
        </div>
      </dl>

      <div v-if="paged.length === 0" class="empty-state">
        <p class="empty-state-title">Ningún cierre coincide</p>
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
                  <button
                    type="button"
                    class="ledger-sort"
                    :class="{ 'is-active': sort.key === 'fecha' }"
                    title="Ordena los cierres por la fecha de su última cuota"
                    @click="toggleSort('fecha')"
                  >
                    Fecha <span class="ledger-sort-caret">{{ sortCaret('fecha') }}</span>
                  </button>
                </th>
                <th>Cuota</th>
                <th class="ledger-num">
                  <button
                    type="button"
                    class="ledger-sort"
                    :class="{ 'is-active': sort.key === 'monto' }"
                    title="Ordena los cierres por su precio total"
                    @click="toggleSort('monto')"
                  >
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
            <tbody v-for="group in paged" :key="group.key" class="deal-group">
              <tr class="deal-head-row">
                <td class="deal-head-cell" :colspan="9">
                  <DealPlanHeader :group="group" @saved="onPlanSaved" />
                </td>
                <td class="ledger-col-actions"></td>
              </tr>
              <tr
                v-for="row in group.payments"
                :key="row.id"
                class="deal-payment-row"
                :class="row.estado === 'pagado' ? 'ledger-row-in' : 'ledger-row-pending'"
              >
                <td class="ledger-code">{{ row.code }}</td>
                <td class="ledger-date">{{ formatDate(row.fecha) }}</td>
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
                  <div class="estado-cell">
                    <span v-if="row.estado === 'verificado'" class="pill pill-success" title="Verificado por Finanzas">
                      ✅ verificado
                    </span>
                    <button
                      v-else
                      type="button"
                      class="pill pill-toggle"
                      :class="row.estado === 'pagado' ? 'pill-info' : 'pill-warning'"
                      :disabled="estadoSaving === row.id"
                      title="Clic para marcarlo como cobrado o devolverlo a pendiente"
                      @click="toggleEstado(row)"
                    >
                      {{ row.estado }}
                    </button>

                    <!-- El visto bueno es exclusivo de Finanzas (finance.verify) -->
                    <button
                      v-if="canVerify && row.estado !== 'pendiente'"
                      type="button"
                      class="verify-btn"
                      :class="{ 'is-verified': row.estado === 'verificado' }"
                      :disabled="verifySaving === row.id"
                      :title="row.estado === 'verificado'
                        ? 'Quitar la verificación (vuelve a bloquear el proyecto)'
                        : 'Verificar: empieza a sumar en Finanzas y activa el proyecto'"
                      @click="toggleVerificacion(row)"
                    >
                      {{ verifySaving === row.id ? '…' : (row.estado === 'verificado' ? '✓ Verificado' : 'Verificar') }}
                    </button>
                    <span v-if="row.is_initial_payment" class="initial-payment-tag" title="Primer pago: activa el proyecto del lead">
                      1er pago
                    </span>
                  </div>
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
                      :title="receiptTitle(rcpt)"
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
                      <span v-else-if="rcpt.missing" class="receipt-thumb-missing">!</span>
                      <span v-else class="receipt-thumb-loading">…</span>
                      <button
                        type="button"
                        class="receipt-remove"
                        title="Eliminar comprobante"
                        @click="removeReceipt(rcpt.id)"
                      >✕</button>
                    </span>
                    <label class="receipt-add" title="Agregar comprobantes (imágenes o PDF)">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        hidden
                        @change="(e) => uploadReceipts(row.id, e)"
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
          noun="cierres"
        />
      </template>
    </template>

    <SendTributarioModal v-if="sendModalRow" :income="sendModalRow" @close="sendModalRow = null" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { apiFetch } from "../../apiClient.js";
import { hasPermission } from "../../auth.js";
import { isPdfReceipt, loadReceiptUrl } from "./receiptImage.js";
import { dayOnly, formatAmount, formatDate } from "./format.js";
import { BANCOS, CUOTAS, EMITIR_OPCIONES, calcItf } from "./incomeOptions.js";
import { useLedgerTable } from "./useLedgerTable.js";
import DealPlanHeader from "./DealPlanHeader.vue";
import LedgerPagination from "./LedgerPagination.vue";
import SendTributarioModal from "./SendTributarioModal.vue";
import "./ledger.css";

// Debe coincidir con MAX_FINANCE_RECEIPTS del backend.
const MAX_RECEIPTS = 10;
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
const verifySaving = ref(null);
// El visto bueno de un ingreso es competencia exclusiva de Finanzas.
const canVerify = hasPermission("finance.verify");
const sendModalRow = ref(null);
const editingRow = ref(null);
const editingTotal = ref(false);
const totalAmountDraft = ref("");
let pendingFiles = [];
let pendingTributarioFile = null;

/** Lead elegido en el formulario, con su precio total y saldo pendiente (si tiene). */
const selectedLead = computed(() => leads.value.find((l) => l.id === form.leadId) || null);

function startEditTotal() {
  totalAmountDraft.value = selectedLead.value?.total_amount ?? "";
  editingTotal.value = true;
}

async function saveTotalAmount() {
  const lead = selectedLead.value;
  if (!lead) return;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/leads/${lead.id}/total-amount`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalAmount: totalAmountDraft.value === "" ? null : totalAmountDraft.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo actualizar el precio total.");
    editingTotal.value = false;
    await fetchLeads();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

/** Clave del grupo que recoge los ingresos que no están atados a ningún lead. */
const SIN_LEAD = "sin-lead";

/**
 * Plan de cobro de cada cierre. Se calcula sobre TODOS los ingresos del lead,
 * no sobre los que pasaron el filtro: el filtro decide qué cuotas se listan,
 * nunca cuánto se lleva cobrado del trato.
 */
const plansByLead = computed(() => {
  const totalByLead = new Map(leads.value.map((lead) => [lead.id, lead.total_amount]));
  const byKey = {};
  for (const row of rows.value) {
    const key = row.lead_id ?? SIN_LEAD;
    const plan = byKey[key] || (byKey[key] = {
      registered: 0, verificado: 0, porVerificar: 0, pendiente: 0, itf: 0,
    });
    const monto = Number(row.monto) || 0;
    plan.registered += monto;
    plan.itf += Number(row.itf) || 0;
    if (row.estado === "verificado") plan.verificado += monto;
    else if (row.estado === "pagado") plan.porVerificar += monto;
    else plan.pendiente += monto;
  }
  for (const [key, plan] of Object.entries(byKey)) {
    plan.registered = Math.round(plan.registered * 100) / 100;
    const total = key === SIN_LEAD ? null : totalByLead.get(Number(key));
    plan.total = total != null ? Number(total) : null;
    plan.saldo = plan.total != null ? Math.round((plan.total - plan.registered) * 100) / 100 : null;
  }
  return byKey;
});

/**
 * La tabla muestra un registro por cierre (lead) con sus cuotas dentro, en vez
 * de una fila suelta por cuota: así el precio total y el avance del cobro se
 * ven una sola vez, junto a los pagos que los componen.
 */
function groupByLead(payments) {
  const byKey = new Map();
  for (const row of payments) {
    const key = row.lead_id ?? SIN_LEAD;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        leadId: row.lead_id ?? null,
        leadName: row.lead_id ? (row.lead_name || `Lead #${row.lead_id}`) : "— Sin asociar —",
        leadDni: row.lead_dni || null,
        payments: [],
        registered: 0, verificado: 0, porVerificar: 0, pendiente: 0, itf: 0,
        total: null, saldo: null,
        ...(plansByLead.value[key] || {}),
      };
      byKey.set(key, group);
    }
    group.payments.push(row);
  }
  for (const group of byKey.values()) {
    group.payments.sort((a, b) => dayOnly(a.fecha).localeCompare(dayOnly(b.fecha)) || a.id - b.id);
    // El cierre se ordena por su cuota más reciente, no por la primera.
    group.lastFecha = group.payments.reduce((max, p) => (dayOnly(p.fecha) > max ? dayOnly(p.fecha) : max), "");
  }
  return [...byKey.values()];
}

const {
  search, estado: estadoFilter, banco: bancoFilter, sort, page, pageSize,
  grouped, paged, totalPages, range, toggleSort, sortCaret, clearFilters
} = useLedgerTable(rows, {
  searchText: (row) => [row.code, row.lead_name, row.lead_dni, row.cuota, row.emitir, row.tributario, row.banco]
    .filter(Boolean).join(" "),
  // Se ordenan y se paginan los cierres, así que los sorters reciben el grupo.
  sorters: {
    fecha: (group) => group.lastFecha,
    monto: (group) => group.total ?? group.registered,
  },
  defaultSort: { key: "fecha", dir: "desc" },
  groupBy: groupByLead,
});

/** La cabecera del cierre agregó un pago o cambió el total: releer ambas cosas. */
async function onPlanSaved(event) {
  successMessage.value = event?.message || "Plan de cobro actualizado.";
  setTimeout(() => { successMessage.value = ""; }, 3000);
  await Promise.all([fetchRows(), fetchLeads()]);
}

/**
 * Totales de los cierres que se están mirando (búsqueda y filtros incluidos).
 * Cada cierre aporta su plan completo, no solo las cuotas que pasaron el
 * filtro: la tira resume tratos, no asientos sueltos. Solo lo verificado es
 * dinero confirmado, y "por cobrar" incluye lo que ni siquiera se ha
 * registrado en una cuota todavía.
 */
const totals = computed(() => {
  let precioTotal = 0;
  let registrado = 0;
  let verificado = 0;
  let porVerificar = 0;
  let itf = 0;
  for (const group of grouped.value) {
    // Un cierre sin precio total definido cuenta por lo que ya tiene registrado.
    precioTotal += group.total ?? group.registered;
    registrado += group.registered;
    verificado += group.verificado;
    porVerificar += group.porVerificar;
    itf += group.itf;
  }
  return {
    precioTotal,
    registrado,
    verificado,
    porVerificar,
    porCobrar: Math.round((precioTotal - verificado - porVerificar) * 100) / 100,
    itf,
  };
});

function emptyForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    leadId: null,
    cuota: "1era",
    emitir: "factura",
    monto: "",
    banco: "BCP",
    estado: "pendiente",
    tributario: "",
  };
}

const form = reactive(emptyForm());

const mesPreview = computed(() => {
  if (!form.fecha) return "";
  return MESES[Number(form.fecha.slice(5, 7)) - 1] || "";
});

const itfPreview = computed(() => calcItf(form.monto));

function onFileChange(event) {
  pendingFiles = Array.from(event.target.files || []).slice(0, MAX_RECEIPTS);
}

/** Texto del tooltip de una miniatura, avisando si el archivo ya no está. */
function receiptTitle(rcpt) {
  const name = rcpt.original_name || "Comprobante";
  return rcpt.missing ? `${name} — el archivo ya no está en el servidor` : name;
}

function onTributarioChange(event) {
  pendingTributarioFile = event.target.files?.[0] || null;
}

function resetForm() {
  Object.assign(form, emptyForm());
  pendingFiles = [];
  pendingTributarioFile = null;
  editingTotal.value = false;
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
    estado: row.estado || "pendiente",
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
  await Promise.all(paged.value.flatMap((group) => group.payments).map(async (row) => {
    await Promise.all((row.receipts || []).map(async (rcpt) => {
      // `missing` lo marca el backend: el archivo ya no está en disco, así que
      // no tiene sentido pedirlo (la fila muestra el aviso en su lugar).
      if (rcpt.missing || receiptUrls[rcpt.id]) return;
      try {
        receiptUrls[rcpt.id] = await loadReceiptUrl(`/api/finance/receipts/${rcpt.id}`);
      } catch {
        rcpt.missing = true;
      }
    }));
    if (row.tributario_filename && !tributarioUrls[row.id]) {
      try {
        tributarioUrls[row.id] = await loadReceiptUrl(`/api/finance/income/${row.id}/tributario`);
      } catch { /* el enlace simplemente no se muestra */ }
    }
  }));
}

watch(paged, hydrateReceipts);
watch(() => form.leadId, () => { editingTotal.value = false; });

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
    // Un fallo del servidor no puede parecer "sin ingresos registrados".
    if (!response.ok) throw new Error(data.error || "No se pudieron obtener los ingresos.");
    rows.value = data.income || [];
    await hydrateReceipts();
  } catch (error) {
    errorMessage.value = error.message || "No se pudieron obtener los ingresos.";
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

    if (pendingFiles.length > 0 && data.income?.id) {
      const fd = new FormData();
      for (const file of pendingFiles) fd.append("receipts", file);
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

async function uploadReceipts(incomeId, event) {
  const files = Array.from(event.target.files || []).slice(0, MAX_RECEIPTS);
  event.target.value = "";
  if (files.length === 0) return;
  errorMessage.value = "";
  try {
    const fd = new FormData();
    for (const file of files) fd.append("receipts", file);
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

async function toggleVerificacion(row) {
  const verified = row.estado !== "verificado";
  if (!verified && !confirm("¿Quitar la verificación? El proyecto asociado volverá a quedar bloqueado.")) {
    return;
  }
  verifySaving.value = row.id;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/income/${row.id}/verificacion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo actualizar la verificación.");
    row.estado = data.income?.estado ?? row.estado;
    if (data.project) {
      successMessage.value = `Ingreso ${data.income.code} ${verified ? "verificado" : "sin verificar"} · ` +
        `proyecto #${data.project.id} → ${data.project.status}.`;
      setTimeout(() => { successMessage.value = ""; }, 4000);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    verifySaving.value = null;
  }
}

async function toggleEstado(row) {
  const nextEstado = row.estado === "pagado" ? "pendiente" : "pagado";
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
/* --------------------------------------------------- Registro por cierre */

/* Cada <tbody> es un cierre: arriba su cabecera (lead, precio total y avance
   del cobro) y debajo las cuotas que lo componen, alineadas con las columnas
   del resto de la tabla. */
.ledger-tab :deep(.ledger-table) tbody.deal-group > tr.deal-head-row > td {
  padding: 0.8rem 1.05rem;
  background: var(--surface-1);
  border-top: 1px solid var(--border-strong);
}

.ledger-tab :deep(.ledger-table) tbody.deal-group:first-of-type > tr.deal-head-row > td {
  border-top: none;
}

/* Las cuotas van sangradas para que se lean como parte de su cierre. */
.ledger-tab :deep(.ledger-table) tr.deal-payment-row > td:first-child {
  padding-left: 1.7rem;
}

/* `.data-table` quita el borde inferior de la última fila de CADA tbody: con
   un tbody por cierre eso fundiría un grupo con el siguiente. */
.ledger-tab :deep(.ledger-table) tbody.deal-group > tr:last-child > td {
  border-bottom: 1px solid var(--border-color);
}

.ledger-tab :deep(.ledger-table) tbody.deal-group:last-of-type > tr:last-child > td {
  border-bottom: none;
}

.lead-total-box {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.lead-total-box .is-out {
  color: var(--accent-rose);
}

.lead-total-edit-btn {
  border: none;
  background: none;
  color: var(--primary);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}

.lead-total-edit-btn:hover {
  text-decoration: underline;
}

.lead-total-input {
  width: 140px;
  padding: 0.25rem 0.5rem;
}

.lead-total-btn {
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
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

.estado-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

/* Verificar es la acción de Finanzas que confirma el dinero y activa el
   proyecto: se separa del pill de estado para que no parezca otro toggle. */
.verify-btn {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.18rem 0.45rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-emerald);
  background: transparent;
  color: var(--accent-emerald);
  cursor: pointer;
  white-space: nowrap;
}

.verify-btn:hover:not(:disabled) {
  background: var(--accent-emerald);
  color: #fff;
}

.verify-btn.is-verified {
  border-style: dashed;
  border-color: var(--border-color);
  color: var(--text-muted);
}

.verify-btn.is-verified:hover:not(:disabled) {
  background: transparent;
  border-color: var(--accent-rose);
  color: var(--accent-rose);
}

.verify-btn:disabled { opacity: 0.6; cursor: wait; }

.initial-payment-tag {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
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
