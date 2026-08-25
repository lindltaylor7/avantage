<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, required: true },
  selected: { type: Boolean, default: false }
});

const isActive = computed(() => (props.data.isWelcome ? true : !!props.data.step?.active));
const icon = computed(() => (props.data.isWelcome ? '🧠' : props.data.meta?.icon || '❓'));
const name = computed(() => (props.data.isWelcome ? 'Agente de Bienvenida' : props.data.meta?.name || props.data.step?.stepKey));
const sub = computed(() => {
  if (props.data.isWelcome) return 'Ollama Cloud LLM · siempre activo';
  return props.data.step?.inputType === 'choice' ? 'Selección múltiple' : 'Texto libre';
});
</script>

<template>
  <div
    class="flow-step-node"
    :class="{ 'is-ai': data.isWelcome, 'is-inactive': !isActive, 'is-selected': selected }"
  >
    <Handle type="target" :position="Position.Left" class="flow-handle" />

    <span class="flow-node-icon">{{ icon }}</span>
    <div class="flow-node-meta">
      <span class="flow-node-name">
        {{ name }}
        <span v-if="data.isWelcome" class="flow-ai-tag">IA</span>
      </span>
      <span class="flow-node-sub">{{ sub }}</span>
    </div>
    <span class="flow-node-status" :class="{ on: isActive }" :title="isActive ? 'Activo' : 'Inactivo'"></span>

    <Handle type="source" :position="Position.Right" class="flow-handle" />
  </div>
</template>

<style scoped>
.flow-step-node {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.65rem 0.85rem;
  width: 220px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  box-shadow: var(--shadow-sm);
}

.flow-step-node:hover {
  border-color: var(--primary);
}

.flow-step-node.is-selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(76, 63, 145, 0.18);
}

.flow-step-node.is-inactive {
  opacity: 0.5;
}

.flow-step-node.is-ai {
  background: linear-gradient(135deg, rgba(76, 63, 145, 0.16), rgba(76, 134, 255, 0.08));
  border-color: rgba(76, 63, 145, 0.35);
  cursor: default;
}

.flow-step-node.is-ai.is-selected {
  border-color: rgba(76, 63, 145, 0.7);
  box-shadow: 0 0 0 3px rgba(76, 63, 145, 0.18);
}

.flow-node-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  flex-shrink: 0;
}

.is-ai .flow-node-icon {
  background: linear-gradient(135deg, #4C3F91, #2F6FB0);
}

.flow-node-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 0.1rem;
}

.flow-node-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-ai-tag {
  font-size: 0.58rem;
  font-weight: 800;
  color: #A79AFF;
  background: rgba(76, 63, 145, 0.2);
  border: 1px solid rgba(76, 63, 145, 0.4);
  border-radius: 5px;
  padding: 0.05rem 0.32rem;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.flow-node-sub {
  font-size: 0.68rem;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-node-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-rose);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(178, 58, 69, 0.5);
}

.flow-node-status.on {
  background: var(--accent-emerald);
  box-shadow: 0 0 6px rgba(47, 125, 90, 0.6);
}

.flow-handle {
  width: 8px;
  height: 8px;
  background: var(--text-sub);
  border: 2px solid var(--bg-card-solid);
  opacity: 0.55;
}
</style>
