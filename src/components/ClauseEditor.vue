<template>
  <div class="ct-clause-editor">
    <p class="ct-hint">
      Marcadores que se completan solos en el documento:
      <code v-for="tag in PLACEHOLDER_TAGS" :key="tag" v-text="tag"></code>
    </p>

    <ol class="ct-clauses">
      <li v-for="(clause, i) in clauses" :key="clause.key" class="ct-clause">
        <div class="ct-clause-head">
          <span class="ct-clause-number">{{ i + 1 }}</span>
          <input v-model="clause.title" class="form-input" placeholder="Título de la cláusula" />
          <div class="ct-clause-actions">
            <button type="button" title="Subir" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button type="button" title="Bajar" :disabled="i === clauses.length - 1" @click="move(i, 1)">↓</button>
            <button type="button" title="Quitar" class="ct-remove" @click="clauses.splice(i, 1)">✕</button>
          </div>
        </div>
        <textarea v-model="clause.body" class="form-textarea" rows="4" placeholder="Texto de la cláusula"></textarea>
      </li>
    </ol>

    <div class="ct-add">
      <button type="button" class="btn-secondary" @click="add({ title: '', body: '' })">+ Cláusula en blanco</button>
      <select v-if="missingSuggestions.length" class="form-select" value="" @change="addSuggestion">
        <option value="" disabled>+ Recuperar cláusula del tipo de contrato…</option>
        <option v-for="c in missingSuggestions" :key="c.title" :value="c.title">{{ c.title }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { withKeys } from '../views/contracts/contractsApi.js';

/**
 * Editor de una lista de cláusulas (agregar, quitar, editar, reordenar).
 * Lo usan tanto los contratos como los tipos de contrato. `suggestions` son
 * las cláusulas base del tipo: las que ya no están se pueden recuperar.
 */
const clauses = defineModel({ type: Array, required: true });
const props = defineProps({ suggestions: { type: Array, default: () => [] } });

const PLACEHOLDER_TAGS = ['cliente', 'dni', 'domicilio', 'correo', 'telefono', 'servicio', 'monto', 'ciudad', 'fecha', 'representante', 'empresa', 'ruc']
  .map((key) => `{{${key}}}`);

const missingSuggestions = computed(() => {
  const present = new Set(clauses.value.map((c) => c.title.trim().toUpperCase()));
  return props.suggestions.filter((c) => !present.has(c.title.trim().toUpperCase()));
});

function add(clause) {
  clauses.value.push(...withKeys([clause]));
}

function addSuggestion(event) {
  const clause = missingSuggestions.value.find((c) => c.title === event.target.value);
  if (clause) add(clause);
  event.target.value = '';
}

function move(index, delta) {
  const list = clauses.value;
  [list[index], list[index + delta]] = [list[index + delta], list[index]];
}
</script>
