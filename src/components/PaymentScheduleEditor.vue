<!--
  Editor del cronograma de pagos: una fila por cuota (monto + vencimiento).

  Lo comparten el modal de "lead ganado" y el contrato porque en los dos lados
  se edita el MISMO plan —las cuotas reales de Finanzas—, así que las reglas
  ("no pasarse del precio total", "una cuota cobrada no se toca") tienen que
  leerse igual desde cualquiera de las dos pantallas.
-->
<template>
  <div class="ps-wrap">
    <div v-if="rows.length > 0" class="ps-table">
      <div class="ps-head">
        <span>Cuota</span>
        <span>Monto ({{ symbol }})</span>
        <span>Vence</span>
        <span aria-label="Acciones"></span>
      </div>

      <div v-for="(row, index) in rows" :key="row.key" class="ps-row" :class="{ 'is-locked': row.locked }">
        <span class="ps-ordinal">
          {{ cuotaLabel(offset + index) }}
          <span v-if="row.locked" class="ps-locked-tag" :title="lockedTitle(row)">🔒 {{ row.estado }}</span>
        </span>
        <input
          v-model="row.monto"
          type="number"
          step="0.01"
          min="0.01"
          class="form-input ps-input"
          :disabled="row.locked"
          placeholder="0.00"
          @input="emitRows"
        />
        <input
          v-model="row.dueDate"
          type="date"
          class="form-input ps-input"
          :disabled="row.locked"
          @input="emitRows"
        />
        <button
          type="button"
          class="ps-remove"
          :disabled="row.locked"
          :title="row.locked ? 'Esta cuota ya se cobró' : 'Quitar la cuota'"
          @click="removeRow(index)"
        >
          ✕
        </button>
      </div>
    </div>

    <p v-else class="ps-empty">
      Todavía no hay cuotas programadas. Agrega las que falten para completar el precio del cierre.
    </p>

    <div class="ps-footer">
      <button type="button" class="ps-add" @click="addRow">+ Agregar cuota</button>
      <p class="ps-summary" :class="summaryClass">
        Programado <strong>{{ symbol }} {{ scheduled.toFixed(2) }}</strong>
        <template v-if="total !== null">
          de {{ symbol }} {{ total.toFixed(2) }} ·
          <template v-if="remaining > 0.005">falta {{ symbol }} {{ remaining.toFixed(2) }}</template>
          <template v-else-if="remaining < -0.005">excede por {{ symbol }} {{ Math.abs(remaining).toFixed(2) }}</template>
          <template v-else>cronograma completo ✓</template>
        </template>
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { cuotaLabel } from '../views/finance/incomeOptions.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  /** Precio total del cierre; `null` cuando todavía no se fijó. */
  total: { type: Number, default: null },
  /** Monto que ya cuenta para el total pero no se edita acá (el primer pago del cierre). */
  baseAmount: { type: Number, default: 0 },
  /** Cuántas cuotas van antes de las de esta lista, para numerarlas bien. */
  offset: { type: Number, default: 0 },
  currency: { type: String, default: 'PEN' }
});
const emit = defineEmits(['update:modelValue']);

// Copia local con una `key` estable por fila: sin ella, borrar una cuota del
// medio hace que Vue reutilice el input equivocado y el usuario ve el monto
// de otra fila en el campo que acaba de editar.
let nextKey = 0;
const rows = ref([]);

watch(() => props.modelValue, (value) => {
  const incoming = (value || []).map((row) => ({ key: row.key ?? `r${nextKey++}`, ...row }));
  if (JSON.stringify(strip(incoming)) === JSON.stringify(strip(rows.value))) return;
  rows.value = incoming;
}, { immediate: true, deep: true });

const symbol = computed(() => (props.currency === 'USD' ? 'US$' : 'S/'));

const scheduled = computed(() =>
  props.baseAmount + rows.value.reduce((sum, row) => sum + (Number(row.monto) || 0), 0));

const remaining = computed(() => (props.total === null ? 0 : props.total - scheduled.value));

const summaryClass = computed(() => {
  if (props.total === null) return '';
  if (remaining.value < -0.005) return 'is-over';
  if (Math.abs(remaining.value) <= 0.005) return 'is-complete';
  return '';
});

function strip(list) {
  return list.map(({ id = null, monto, dueDate, locked = false }) => ({ id, monto, dueDate, locked }));
}

function lockedTitle(row) {
  return row.estado === 'verificado'
    ? 'Finanzas ya verificó esta cuota.'
    : 'El cliente ya subió su comprobante: la cuota está en revisión.';
}

/**
 * La cuota nueva se propone un mes después de la última y por el saldo que
 * falte: el caso frecuente es "el resto en una sola cuota el mes que viene",
 * y así se resuelve sin escribir nada.
 */
function addRow() {
  const last = rows.value[rows.value.length - 1];
  const base = last?.dueDate ? new Date(`${last.dueDate}T12:00:00`) : new Date();
  base.setMonth(base.getMonth() + 1);
  const pending = props.total === null ? 0 : Math.max(0, Math.round(remaining.value * 100) / 100);

  rows.value.push({
    key: `r${nextKey++}`,
    id: null,
    monto: pending > 0 ? String(pending) : '',
    dueDate: base.toISOString().slice(0, 10),
    locked: false
  });
  emitRows();
}

function removeRow(index) {
  if (rows.value[index]?.locked) return;
  rows.value.splice(index, 1);
  emitRows();
}

function emitRows() {
  emit('update:modelValue', rows.value.map((row) => ({ ...row })));
}
</script>

<style scoped>
.ps-wrap {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
}

.ps-table {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.ps-head,
.ps-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr 1fr 1.75rem;
  gap: 0.5rem;
  align-items: center;
}

.ps-head {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ps-ordinal {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-sub);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.ps-locked-tag {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--accent-emerald);
}

.ps-input {
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
}

.ps-row.is-locked .ps-input {
  opacity: 0.65;
  cursor: not-allowed;
}

.ps-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1;
  padding: 0.25rem;
}

.ps-remove:hover:not(:disabled) { color: var(--accent-rose); }
.ps-remove:disabled { opacity: 0.3; cursor: not-allowed; }

.ps-empty {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.ps-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--border-color);
}

.ps-add {
  background: none;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  color: var(--text-sub);
  cursor: pointer;
}

.ps-add:hover { color: var(--text-main); border-color: var(--text-muted); }

.ps-summary {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.ps-summary.is-complete { color: var(--accent-emerald); }
.ps-summary.is-over { color: var(--accent-rose); }
</style>
