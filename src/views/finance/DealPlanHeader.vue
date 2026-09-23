<template>
  <div class="deal-plan" :class="{ 'is-collapsed': collapsed }">
    <!-- Plegado, el cierre se lee de un vistazo: nombre, precio y barra. Los
         detalles y las acciones aparecen al abrirlo. -->
    <button
      type="button"
      class="deal-toggle"
      :aria-expanded="!collapsed"
      :title="collapsed ? 'Ver las cuotas de este cierre' : 'Ocultar las cuotas'"
      @click="emit('toggle')"
    >
      <span class="deal-caret" :class="{ 'is-open': !collapsed }">▸</span>
    </button>

    <div class="deal-id" @click="emit('toggle')">
      <span v-if="!collapsed" class="deal-code" title="Código del cliente: lo comparten todas sus cuotas">
        {{ group.code }}
      </span>
      <span class="deal-name">{{ group.leadName }}</span>
      <span class="deal-meta">
        <span v-if="group.leadDni && !collapsed">DNI {{ group.leadDni }}</span>
        <span>{{ group.payments.length }} {{ group.payments.length === 1 ? "cuota" : "cuotas" }}</span>
        <!-- Visible también plegado: es lo que explica un proyecto que no arranca. -->
        <span v-if="blockingPayment" class="deal-gate-chip" title="La primera cuota no está verificada: el proyecto del cliente sigue bloqueado.">
          🔒 proyecto bloqueado
        </span>
      </span>
    </div>

    <div v-if="group.leadId" class="deal-total">
      <template v-if="editingTotal">
        <input
          v-model="totalDraft"
          type="number"
          step="0.01"
          min="0.01"
          class="form-input deal-total-input"
          placeholder="Precio total (S/)"
        />
        <button type="button" class="btn-secondary deal-mini-btn" :disabled="savingTotal" @click="saveTotal">
          {{ savingTotal ? "…" : "Guardar" }}
        </button>
        <button type="button" class="btn-secondary deal-mini-btn" @click="editingTotal = false">Cancelar</button>
      </template>
      <template v-else>
        <span class="deal-total-label">Precio total</span>
        <strong v-if="group.total != null" class="deal-total-value">S/ {{ formatAmount(group.total) }}</strong>
        <span v-else class="deal-total-value is-empty">sin definir</span>
        <button
          v-if="!collapsed"
          type="button"
          class="deal-edit-btn"
          title="Editar el precio total del cierre"
          @click="startEditTotal"
        >
          ✎
        </button>
      </template>
    </div>

    <div v-if="group.total != null" class="deal-progress">
      <div class="deal-bar" role="img" :aria-label="`${pctCubierto}% del precio total ya cubierto`">
        <span class="deal-bar-seg is-verificado" :style="{ width: segWidth(group.verificado) }"></span>
        <span class="deal-bar-seg is-porverificar" :style="{ width: segWidth(group.porVerificar) }"></span>
        <span class="deal-bar-seg is-pendiente" :style="{ width: segWidth(group.pendiente) }"></span>
      </div>
      <p v-if="!collapsed" class="deal-caption">
        <strong>{{ pctCubierto }}%</strong> cubierto ·
        <i class="dot is-verificado"></i> verificado S/ {{ formatAmount(group.verificado) }} ·
        <i class="dot is-porverificar"></i> por verificar S/ {{ formatAmount(group.porVerificar) }} ·
        <i class="dot is-pendiente"></i> pendiente S/ {{ formatAmount(group.pendiente) }} ·
        <i class="dot is-saldo"></i> sin registrar S/ {{ formatAmount(group.saldo) }}
      </p>
    </div>
    <p v-else-if="group.leadId && !collapsed" class="deal-caption deal-no-total">
      Sin precio total del cierre: regístralo con ✎ para ver cuánto falta por cobrar.
    </p>

    <button
      v-if="group.leadId && !collapsed"
      type="button"
      class="deal-add-toggle"
      :class="{ 'is-open': isAdding }"
      @click="toggleAdd"
    >
      {{ isAdding ? "✕ Cancelar" : "+ Agregar pago" }}
    </button>
  </div>

  <!-- El cierre tiene que decir por qué el proyecto del cliente no arranca:
       desde Proyectos solo se ve el candado, no la cuota que lo abre. -->
  <p v-if="blockingPayment && !collapsed" class="deal-gate-note">
    🔒 El proyecto de este cliente sigue bloqueado hasta que verifiques la
    <strong>{{ blockingPayment.cuota }}</strong> cuota (la primera del cronograma), hoy en estado
    <strong>{{ blockingPayment.estado }}</strong>. Registrar otro pago no lo desbloquea.
  </p>

  <p v-if="errorMessage" class="deal-alert">⚠️ {{ errorMessage }}</p>

  <form v-if="isAdding" class="deal-add" @submit.prevent="addPayment">
    <div class="deal-add-grid">
      <label class="deal-field">
        <span>Fecha</span>
        <input v-model="draft.fecha" type="date" class="form-input" required />
      </label>
      <label class="deal-field">
        <span>Cuota</span>
        <select v-model="draft.cuota" class="form-select" required>
          <option v-for="c in CUOTAS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="deal-field">
        <span>Emitir</span>
        <select v-model="draft.emitir" class="form-select" required>
          <option v-for="e in EMITIR_OPCIONES" :key="e" :value="e">{{ e }}</option>
        </select>
      </label>
      <label class="deal-field">
        <span>Monto (S/)</span>
        <input v-model="draft.monto" type="number" step="0.01" min="0.01" class="form-input" placeholder="0.00" required />
      </label>
      <label class="deal-field">
        <span>Banco</span>
        <select v-model="draft.banco" class="form-select" required>
          <option v-for="b in BANCOS" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>
      <label class="deal-field">
        <span>Estado</span>
        <select v-model="draft.estado" class="form-select">
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
        </select>
      </label>
      <div class="deal-field deal-field-action">
        <button type="submit" class="btn-primary deal-add-btn" :disabled="isSaving">
          {{ isSaving ? "Guardando..." : "Guardar pago" }}
        </button>
      </div>
    </div>
    <p class="deal-add-hint">
      ITF estimado S/ {{ formatAmount(itfPreview) }} · los comprobantes y el archivo tributario se
      adjuntan después, desde la fila de la cuota.
    </p>
  </form>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { apiFetch } from "../../apiClient.js";
import { formatAmount } from "./format.js";
import { BANCOS, CUOTAS, EMITIR_OPCIONES, calcItf } from "./incomeOptions.js";

const props = defineProps({
  /** Cierre (lead) con su plan de cobro y las cuotas que se están listando. */
  group: { type: Object, required: true },
  /** Plegado: solo se muestran nombre, precio total y barra de avance. */
  collapsed: { type: Boolean, default: false },
});

const emit = defineEmits(["saved", "toggle"]);

const errorMessage = ref("");
const isAdding = ref(false);
const isSaving = ref(false);
const editingTotal = ref(false);
const savingTotal = ref(false);
const totalDraft = ref("");

/** Cubierto = lo que ya está registrado en cuotas sobre el precio del cierre. */
const pctCubierto = computed(() => {
  const total = Number(props.group.total) || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((props.group.registered / total) * 100));
});

const itfPreview = computed(() => calcItf(draft.monto));

/**
 * La primera cuota del cronograma cuando todavía no está verificada: es la que
 * mantiene bloqueado el proyecto del cliente. El backend garantiza que el
 * marcador esté siempre en esa cuota y en una sola.
 */
const blockingPayment = computed(() => {
  const gating = props.group.payments.find((payment) => payment.is_initial_payment);
  return gating && gating.estado !== "verificado" ? gating : null;
});

function segWidth(value) {
  const total = Number(props.group.total) || 0;
  if (total <= 0) return "0%";
  return `${Math.min(100, ((Number(value) || 0) / total) * 100)}%`;
}

/** La siguiente cuota libre del cierre, para no repetir una ya registrada. */
function nextCuota() {
  const used = new Set(props.group.payments.map((p) => p.cuota));
  return CUOTAS.find((c) => !used.has(c)) || CUOTAS[CUOTAS.length - 1];
}

function emptyDraft() {
  const last = props.group.payments[props.group.payments.length - 1];
  return {
    fecha: new Date().toISOString().slice(0, 10),
    cuota: nextCuota(),
    emitir: last?.emitir || "boleta",
    // Lo habitual es cobrar todo lo que falta, así que el saldo va propuesto.
    monto: props.group.saldo > 0 ? String(props.group.saldo) : "",
    banco: last?.banco || BANCOS[0],
    estado: "pendiente",
  };
}

const draft = reactive(emptyDraft());

function toggleAdd() {
  isAdding.value = !isAdding.value;
  errorMessage.value = "";
  // El borrador se rehace al abrir: el saldo sugerido es el de este momento.
  if (isAdding.value) Object.assign(draft, emptyDraft());
}

function startEditTotal() {
  // Sin precio total todavía, lo ya registrado es la mejor propuesta: casi
  // siempre el cierre se pactó por esa cifra y solo falta dejarla escrita.
  totalDraft.value = props.group.total ?? props.group.registered ?? "";
  editingTotal.value = true;
}

async function saveTotal() {
  savingTotal.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/leads/${props.group.leadId}/total-amount`, {
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
      body: JSON.stringify({ ...draft, leadId: props.group.leadId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo registrar el pago.");
    isAdding.value = false;
    emit("saved", { message: `Pago ${data.income?.code || ""} agregado al cierre.` });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.deal-plan {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
}

.deal-plan.is-collapsed { gap: 0.5rem 1rem; }

.deal-toggle {
  flex-shrink: 0;
  padding: 0.2rem 0.35rem;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
}

.deal-toggle:hover { color: var(--text-main); }

.deal-caret {
  display: inline-block;
  font-size: 0.7rem;
  transition: transform 0.15s ease;
}

.deal-caret.is-open { transform: rotate(90deg); }

.deal-id { display: flex; flex-direction: column; gap: 0.1rem; min-width: 150px; cursor: pointer; }

.deal-code {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.deal-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
  line-height: 1.25;
}

.deal-meta {
  display: flex;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--text-muted);
}

.deal-total { display: flex; align-items: center; gap: 0.4rem; }

.deal-total-label {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.deal-total-value {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.deal-total-value.is-empty { font-weight: 400; font-size: 0.78rem; color: var(--text-muted); }
.deal-total-input { width: 130px; padding: 0.25rem 0.5rem; }
.deal-mini-btn { padding: 0.25rem 0.6rem; font-size: 0.72rem; }

.deal-edit-btn {
  border: none;
  background: none;
  color: var(--primary);
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

/* Avance del cierre: el ancho completo es el precio total y cada tramo una
   etapa del cobro. Lo que queda en gris todavía no está registrado en
   ninguna cuota. */
.deal-progress { flex: 1 1 260px; min-width: 200px; }

.deal-bar {
  display: flex;
  height: 7px;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--surface-3);
}

.deal-bar-seg { display: block; height: 100%; transition: width 0.25s ease; }
.deal-bar-seg.is-verificado { background: var(--accent-emerald); }
.deal-bar-seg.is-porverificar { background: rgba(46, 125, 70, 0.45); }
.deal-bar-seg.is-pendiente { background: var(--accent-amber); }

.deal-caption {
  margin: 0.32rem 0 0;
  font-size: 0.68rem;
  color: var(--text-muted);
}

.deal-caption strong { color: var(--text-main); font-family: var(--font-mono); }
.deal-no-total { flex: 1 1 200px; margin: 0; }

.deal-caption .dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--surface-3);
  margin-right: 0.1rem;
}

.deal-caption .dot.is-verificado { background: var(--accent-emerald); }
.deal-caption .dot.is-porverificar { background: rgba(46, 125, 70, 0.45); }
.deal-caption .dot.is-pendiente { background: var(--accent-amber); }

.deal-add-toggle {
  margin-left: auto;
  padding: 0.3rem 0.7rem;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.deal-add-toggle:hover { border-style: solid; background: var(--surface-2); }
.deal-add-toggle.is-open { color: var(--text-muted); }

.deal-gate-note {
  margin: 0.35rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  background: rgba(200, 85, 50, 0.1);
  border: 1px solid rgba(200, 85, 50, 0.28);
  color: var(--text-sub);
  font-size: 0.78rem;
  line-height: 1.5;
}

.deal-gate-chip {
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  background: rgba(200, 85, 50, 0.12);
  border: 1px solid rgba(200, 85, 50, 0.3);
  color: var(--accent-rose);
  font-weight: 700;
  white-space: nowrap;
}

.deal-alert { margin: 0.5rem 0 0; font-size: 0.76rem; color: var(--accent-rose); }

.deal-add {
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--border-color);
}

.deal-add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
  gap: 0.55rem;
  align-items: end;
}

.deal-field { display: flex; flex-direction: column; gap: 0.22rem; }
.deal-field > span { font-size: 0.66rem; color: var(--text-muted); }

.deal-field .form-input,
.deal-field .form-select {
  margin: 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
}

.deal-field-action { justify-content: flex-end; }
.deal-add-btn { padding: 0.45rem 0.8rem; font-size: 0.78rem; white-space: nowrap; }

.deal-add-hint { margin: 0.45rem 0 0; font-size: 0.68rem; color: var(--text-muted); }
</style>
