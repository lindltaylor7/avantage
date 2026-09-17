<template>
  <div class="plan-panel">
    <header class="plan-head">
      <div class="plan-head-id">
        <p class="plan-eyebrow">Plan de cobro</p>
        <h4 class="plan-title">{{ leadName }}</h4>
      </div>
      <div class="plan-total">
        <template v-if="editingTotal">
          <input
            v-model="totalDraft"
            type="number"
            step="0.01"
            min="0.01"
            class="form-input plan-total-input"
            placeholder="Precio total (S/)"
          />
          <button type="button" class="btn-secondary plan-mini-btn" :disabled="savingTotal" @click="saveTotal">
            {{ savingTotal ? "…" : "Guardar" }}
          </button>
          <button type="button" class="btn-secondary plan-mini-btn" @click="editingTotal = false">Cancelar</button>
        </template>
        <template v-else>
          <span class="plan-total-label">Precio total del cierre</span>
          <strong v-if="plan.total != null" class="plan-total-value">S/ {{ formatAmount(plan.total) }}</strong>
          <span v-else class="ledger-muted">sin definir</span>
          <button type="button" class="plan-edit-btn" title="Editar el precio total del cierre" @click="startEditTotal">
            ✎
          </button>
        </template>
      </div>
    </header>

    <p v-if="errorMessage" class="plan-alert">⚠️ {{ errorMessage }}</p>

    <div v-if="plan.total != null" class="plan-progress">
      <div class="plan-bar" role="img" :aria-label="`${pctRegistrado}% del precio total ya registrado en cuotas`">
        <span class="plan-bar-seg is-verificado" :style="{ width: segWidth(plan.verificado) }"></span>
        <span class="plan-bar-seg is-porverificar" :style="{ width: segWidth(plan.porVerificar) }"></span>
        <span class="plan-bar-seg is-pendiente" :style="{ width: segWidth(plan.pendiente) }"></span>
      </div>
      <p class="plan-caption">
        <strong>{{ pctRegistrado }}%</strong> del precio total está registrado en cuotas
        (S/ {{ formatAmount(plan.registered) }} de S/ {{ formatAmount(plan.total) }}) ·
        cobrado y verificado <strong class="is-in">{{ pctVerificado }}%</strong>
      </p>
      <ul class="plan-legend">
        <li><i class="is-verificado"></i> Verificado <b>S/ {{ formatAmount(plan.verificado) }}</b></li>
        <li><i class="is-porverificar"></i> Por verificar <b>S/ {{ formatAmount(plan.porVerificar) }}</b></li>
        <li><i class="is-pendiente"></i> Pendiente <b>S/ {{ formatAmount(plan.pendiente) }}</b></li>
        <li><i class="is-saldo"></i> Sin registrar <b>S/ {{ formatAmount(plan.saldo) }}</b></li>
      </ul>
    </div>
    <p v-else class="plan-caption plan-no-total">
      Este lead no tiene precio total del cierre, así que no se puede medir cuánto falta por cobrar.
      Regístralo con ✎ para ver el avance.
    </p>

    <ol class="plan-list">
      <li
        v-for="p in plan.payments"
        :key="p.id"
        class="plan-item"
        :class="{ 'is-current': p.id === currentId }"
      >
        <span class="plan-item-code">{{ p.code }}</span>
        <span class="plan-item-date">{{ formatDate(p.fecha) }}</span>
        <span class="plan-item-cuota">
          <span class="ledger-eyebrow">{{ p.emitir }}</span>
          {{ p.cuota }}
        </span>
        <span class="plan-item-amount">S/ {{ formatAmount(p.monto) }}</span>
        <span class="pill" :class="estadoPillClass(p.estado)">{{ p.estado }}</span>
        <span class="plan-item-tags">
          <span v-if="p.is_initial_payment" class="plan-tag" title="Primer pago: activa el proyecto del lead">1er pago</span>
          <span v-if="p.receipts && p.receipts.length" class="plan-tag" title="Comprobantes adjuntos">
            {{ p.receipts.length }} comprob.
          </span>
        </span>
      </li>
    </ol>

    <form v-if="canAdd" class="plan-add" @submit.prevent="addPayment">
      <p class="plan-add-title">Agregar un pago a este plan</p>
      <div class="plan-add-grid">
        <label class="plan-field">
          <span>Fecha</span>
          <input v-model="draft.fecha" type="date" class="form-input" required />
        </label>
        <label class="plan-field">
          <span>Cuota</span>
          <select v-model="draft.cuota" class="form-select" required>
            <option v-for="c in CUOTAS" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="plan-field">
          <span>Emitir</span>
          <select v-model="draft.emitir" class="form-select" required>
            <option v-for="e in EMITIR_OPCIONES" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
        <label class="plan-field">
          <span>Monto (S/)</span>
          <input v-model="draft.monto" type="number" step="0.01" min="0.01" class="form-input" placeholder="0.00" required />
        </label>
        <label class="plan-field">
          <span>Banco</span>
          <select v-model="draft.banco" class="form-select" required>
            <option v-for="b in BANCOS" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label class="plan-field">
          <span>Estado</span>
          <select v-model="draft.estado" class="form-select">
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
        </label>
        <div class="plan-field plan-field-action">
          <button type="submit" class="btn-primary plan-add-btn" :disabled="isSaving">
            {{ isSaving ? "Guardando..." : "+ Agregar pago" }}
          </button>
        </div>
      </div>
      <p class="plan-add-hint">
        ITF estimado S/ {{ formatAmount(itfPreview) }} · los comprobantes y el archivo tributario se
        adjuntan desde la fila del pago, en la tabla.
      </p>
    </form>
    <p v-else class="plan-add-hint plan-add-done">
      Las cuotas registradas ya cubren el precio total. Para cobrar más, sube antes el precio del cierre con ✎.
    </p>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import { apiFetch } from "../../apiClient.js";
import { formatAmount, formatDate } from "./format.js";
import { BANCOS, CUOTAS, EMITIR_OPCIONES, calcItf, estadoPillClass } from "./incomeOptions.js";

const props = defineProps({
  /** Plan del lead, ya agregado por la pestaña: total, sumas por etapa y cuotas. */
  plan: { type: Object, required: true },
  leadName: { type: String, default: "" },
  /** Ingreso desde cuya fila se abrió el desplegable (se resalta en la lista). */
  currentId: { type: [Number, String], default: null },
});

const emit = defineEmits(["saved"]);

const errorMessage = ref("");
const isSaving = ref(false);
const editingTotal = ref(false);
const savingTotal = ref(false);
const totalDraft = ref("");

const pctRegistrado = computed(() => pct(props.plan.registered));
const pctVerificado = computed(() => pct(props.plan.verificado));
const itfPreview = computed(() => calcItf(draft.monto));

/** Con el total ya cubierto el backend rechazaría el alta: mejor no ofrecerla. */
const canAdd = computed(() => props.plan.total == null || props.plan.saldo > 0.009);

function pct(value) {
  const total = Number(props.plan.total) || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round(((Number(value) || 0) / total) * 100));
}

function segWidth(value) {
  const total = Number(props.plan.total) || 0;
  if (total <= 0) return "0%";
  return `${Math.min(100, ((Number(value) || 0) / total) * 100)}%`;
}

/** La siguiente cuota libre del lead, para no repetir una ya registrada. */
function nextCuota() {
  const used = new Set(props.plan.payments.map((p) => p.cuota));
  return CUOTAS.find((c) => !used.has(c)) || CUOTAS[CUOTAS.length - 1];
}

function emptyDraft() {
  const last = props.plan.payments[props.plan.payments.length - 1];
  return {
    fecha: new Date().toISOString().slice(0, 10),
    cuota: nextCuota(),
    emitir: last?.emitir || "boleta",
    // Lo habitual es cobrar todo lo que falta, así que el saldo va propuesto.
    monto: props.plan.saldo > 0 ? String(props.plan.saldo) : "",
    banco: last?.banco || BANCOS[0],
    estado: "pendiente",
  };
}

const draft = reactive(emptyDraft());

// Tras registrar un pago la pestaña recarga el plan: el borrador se rehace para
// que el monto sugerido sea el saldo que queda ahora.
watch(
  () => [props.plan.registered, props.plan.total],
  () => {
    if (!isSaving.value) Object.assign(draft, emptyDraft());
  },
);

function startEditTotal() {
  totalDraft.value = props.plan.total ?? "";
  editingTotal.value = true;
}

async function saveTotal() {
  savingTotal.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/leads/${props.plan.leadId}/total-amount`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalAmount: totalDraft.value === "" ? null : totalDraft.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo actualizar el precio total.");
    editingTotal.value = false;
    emit("saved", { message: "Precio total actualizado." });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingTotal.value = false;
  }
}

async function addPayment() {
  isSaving.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch("/api/finance/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, leadId: props.plan.leadId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo registrar el pago.");
    emit("saved", { message: `Pago ${data.income?.code || ""} agregado al plan.` });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.plan-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.2rem 0 0.4rem;
}

.plan-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.plan-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}

.plan-title {
  margin: 0.1rem 0 0;
  font-size: 0.95rem;
  color: var(--text-main);
}

.plan-total {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.plan-total-label {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.plan-total-value {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--text-main);
}

.plan-total-input { width: 140px; padding: 0.25rem 0.5rem; }
.plan-mini-btn { padding: 0.25rem 0.6rem; font-size: 0.72rem; }

.plan-edit-btn {
  border: none;
  background: none;
  color: var(--primary);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
}

.plan-alert {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent-rose);
}

/* Barra de avance: el ancho completo es el precio del cierre y cada tramo una
   etapa del cobro (verificado / por verificar / pendiente). Lo que queda en
   gris es lo que todavía no está registrado en ninguna cuota. */
.plan-bar {
  display: flex;
  height: 8px;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--surface-3);
}

.plan-bar-seg { display: block; height: 100%; transition: width 0.25s ease; }
.plan-bar-seg.is-verificado { background: var(--accent-emerald); }
.plan-bar-seg.is-porverificar { background: rgba(46, 125, 70, 0.45); }
.plan-bar-seg.is-pendiente { background: var(--accent-amber); }

.plan-caption {
  margin: 0.45rem 0 0;
  font-size: 0.76rem;
  color: var(--text-muted);
}

.plan-caption .is-in { color: var(--accent-emerald); }
.plan-no-total { margin: 0; }

.plan-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.plan-legend li { display: inline-flex; align-items: center; gap: 0.35rem; }
.plan-legend b { color: var(--text-main); font-family: var(--font-mono); font-weight: 500; }

.plan-legend i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: var(--surface-3);
}

.plan-legend i.is-verificado { background: var(--accent-emerald); }
.plan-legend i.is-porverificar { background: rgba(46, 125, 70, 0.45); }
.plan-legend i.is-pendiente { background: var(--accent-amber); }

.plan-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.plan-item {
  display: grid;
  grid-template-columns: 7.5rem 6rem minmax(5rem, 1fr) 7rem auto 1fr;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card-solid);
  font-size: 0.78rem;
}

/* La cuota desde cuya fila se abrió el desplegable, para no perderla de vista. */
.plan-item.is-current {
  border-color: var(--primary);
  background: var(--surface-1);
}

.plan-item-code { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); }
.plan-item-date { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.plan-item-amount { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; }
.plan-item-tags { display: flex; gap: 0.4rem; justify-content: flex-end; }

.plan-tag {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.plan-add {
  border-top: 1px dashed var(--border-color);
  padding-top: 0.7rem;
}

.plan-add-title {
  margin: 0 0 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.plan-add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.6rem;
  align-items: end;
}

.plan-field { display: flex; flex-direction: column; gap: 0.25rem; }

.plan-field > span {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.plan-field .form-input,
.plan-field .form-select {
  margin: 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
}

.plan-field-action { justify-content: flex-end; }
.plan-add-btn { padding: 0.45rem 0.8rem; font-size: 0.78rem; white-space: nowrap; }

.plan-add-hint {
  margin: 0.5rem 0 0;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.plan-add-done { border-top: 1px dashed var(--border-color); padding-top: 0.7rem; }
</style>
