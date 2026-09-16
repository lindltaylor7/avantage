import { computed, reactive, ref, watch } from 'vue';

export const PAGE_SIZES = [25, 50, 100];

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

/**
 * Búsqueda, filtros, orden y paginación en cliente para las tablas del libro
 * contable. Los endpoints de Finanzas devuelven el histórico completo de una
 * sola vez, así que resolverlo aquí mantiene la tabla instantánea y permite
 * calcular los totales del subconjunto que se está mirando.
 *
 * @param rows       ref con las filas crudas del API.
 * @param searchText (fila) => texto sobre el que busca el campo de búsqueda.
 * @param sorters    { clave: (fila) => valor comparable } de columnas ordenables.
 * @param defaultSort { key, dir } orden inicial.
 */
export function useLedgerTable(rows, { searchText, sorters, defaultSort }) {
  const search = ref('');
  const estado = ref('');
  const banco = ref('');
  const sort = reactive({ key: defaultSort.key, dir: defaultSort.dir });
  const page = ref(1);
  const pageSize = ref(PAGE_SIZES[0]);

  const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();
    return rows.value.filter((row) => {
      if (estado.value && row.estado !== estado.value) return false;
      if (banco.value && row.banco !== banco.value) return false;
      return !term || searchText(row).toLowerCase().includes(term);
    });
  });

  const sorted = computed(() => {
    const get = sorters[sort.key];
    if (!get) return filtered.value;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered.value].sort((a, b) => compare(get(a), get(b)) * factor);
  });

  const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)));

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return sorted.value.slice(start, start + pageSize.value);
  });

  const range = computed(() => {
    const total = sorted.value.length;
    if (total === 0) return { from: 0, to: 0, total };
    const from = (page.value - 1) * pageSize.value + 1;
    return { from, to: Math.min(from + pageSize.value - 1, total), total };
  });

  const isFiltered = computed(() => Boolean(search.value.trim() || estado.value || banco.value));

  // Cambiar lo que se está mirando devuelve a la primera página; si la página
  // actual se queda sin filas (al borrar o al filtrar), se retrocede.
  watch([search, estado, banco, pageSize], () => { page.value = 1; });
  watch(totalPages, (count) => { if (page.value > count) page.value = count; });

  function toggleSort(key) {
    if (!sorters[key]) return;
    if (sort.key === key) {
      sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sort.key = key;
      sort.dir = 'desc';
    }
  }

  function sortCaret(key) {
    if (sort.key !== key) return '';
    return sort.dir === 'asc' ? '↑' : '↓';
  }

  function clearFilters() {
    search.value = '';
    estado.value = '';
    banco.value = '';
  }

  return {
    search, estado, banco, sort, page, pageSize,
    filtered, paged, totalPages, range, isFiltered,
    toggleSort, sortCaret, clearFilters
  };
}
