<template>
  <div v-if="range.total > 0" class="ledger-pagination">
    <p class="ledger-pagination-count">
      <strong>{{ range.from }}–{{ range.to }}</strong> de {{ range.total }} {{ noun }}
    </p>

    <div class="ledger-pagination-controls">
      <label class="ledger-pagesize">
        <span>Filas</span>
        <select
          class="ledger-filter"
          :value="pageSize"
          @change="$emit('update:pageSize', Number($event.target.value))"
        >
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <nav v-if="totalPages > 1" class="ledger-pager" aria-label="Paginación">
        <button
          type="button"
          class="ledger-pager-btn"
          :disabled="page <= 1"
          aria-label="Página anterior"
          @click="$emit('update:page', page - 1)"
        >‹</button>

        <template v-for="(slot, index) in slots" :key="`${slot}-${index}`">
          <span v-if="slot === GAP" class="ledger-pager-gap">…</span>
          <button
            v-else
            type="button"
            class="ledger-pager-btn"
            :class="{ 'is-active': slot === page }"
            :aria-current="slot === page ? 'page' : undefined"
            @click="$emit('update:page', slot)"
          >{{ slot }}</button>
        </template>

        <button
          type="button"
          class="ledger-pager-btn"
          :disabled="page >= totalPages"
          aria-label="Página siguiente"
          @click="$emit('update:page', page + 1)"
        >›</button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PAGE_SIZES } from './useLedgerTable.js';

const GAP = '…';

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  range: { type: Object, required: true },
  noun: { type: String, default: 'registros' }
});

defineEmits(['update:page', 'update:pageSize']);

/**
 * Números de página visibles: siempre la primera y la última, más la actual y
 * sus vecinas; los saltos se colapsan en puntos suspensivos.
 */
const slots = computed(() => {
  const total = props.totalPages;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total, props.page, props.page - 1, props.page + 1]);
  const visible = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const out = [];
  let previous = 0;
  for (const n of visible) {
    if (previous && n - previous > 1) out.push(GAP);
    out.push(n);
    previous = n;
  }
  return out;
});
</script>
