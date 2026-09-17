<template>
  <div class="stem" :class="`stem-${size}`">
    <div class="stem-track">
      <div class="stem-fill" :style="{ width: `${clamped}%` }"></div>
      <div class="stem-bud" :style="{ left: `${clamped}%` }">🌱</div>
    </div>
    <span class="stem-value">{{ clamped }}%</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  progress: { type: Number, default: 0 },
  size: { type: String, default: 'sm' } // 'sm' | 'lg'
});

const clamped = computed(() => Math.max(0, Math.min(100, Math.round(props.progress || 0))));
</script>

<style scoped>
.stem {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
}

.stem-track {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: visible;
}

.stem-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--primary-hover), var(--primary));
  transition: width 0.5s ease;
}

.stem-bud {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-card-solid);
  border: 2px solid var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  line-height: 1;
  box-shadow: 0 0 0 4px var(--bg-dark);
  transition: left 0.5s ease;
}

.stem-value {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-sub);
  min-width: 2.6em;
  text-align: right;
  flex-shrink: 0;
}

.stem-lg .stem-track {
  height: 12px;
}

.stem-lg .stem-bud {
  width: 30px;
  height: 30px;
  font-size: 1rem;
}

.stem-lg .stem-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--primary);
}
</style>
