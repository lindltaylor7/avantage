<template>
  <div class="seal-badge" :style="{ width: size + 'px', height: size + 'px' }">
    <svg class="seal-svg" viewBox="0 0 200 200" :style="{ color: toneColor }">
      <defs>
        <path id="seal-arc-top" d="M 34,100 A 66,66 0 0 1 166,100" fill="none" />
        <path id="seal-arc-bottom" d="M 42,138 A 66,66 0 0 0 158,138" fill="none" />
      </defs>

      <!-- Anillo exterior "perforado", como el borde de un sello de goma -->
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="2"
        stroke-dasharray="1.5 5.2" stroke-linecap="round" opacity="0.55" />
      <!-- Anillo interior sólido -->
      <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.85" />

      <text class="seal-arc-text">
        <textPath href="#seal-arc-top" startOffset="50%" text-anchor="middle">EVALUACIÓN AVANTAGE</textPath>
      </text>
      <text class="seal-arc-text">
        <textPath href="#seal-arc-bottom" startOffset="50%" text-anchor="middle">VIABILIDAD {{ normalizedLevel }}</textPath>
      </text>

      <text x="100" y="98" class="seal-number" text-anchor="middle" dominant-baseline="middle">{{ Math.round(score) }}</text>
      <text x="100" y="122" class="seal-percent" text-anchor="middle" dominant-baseline="middle">POR CIENTO</text>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  score: { type: Number, required: true },
  level: { type: String, default: '' },
  size: { type: Number, default: 180 }
});

const normalizedLevel = computed(() => (props.level || '').toUpperCase());

const toneColor = computed(() => {
  const lvl = (props.level || '').toLowerCase();
  if (lvl.includes('baja')) return 'var(--accent-rose)';
  if (lvl.includes('media-alta') || lvl.includes('media alta')) return 'var(--primary)';
  if (lvl.includes('media')) return 'var(--accent-amber)';
  if (lvl.includes('alta')) return 'var(--accent-emerald)';
  return 'var(--primary)';
});
</script>

<style scoped>
/* Ligeramente rotado, como si el sello se hubiera estampado a mano sobre
   el papel — la imperfección deliberada es lo que lo hace leer como un
   sello real y no como un gauge de dashboard genérico. */
.seal-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-3.5deg);
  filter: drop-shadow(0 6px 14px rgba(27, 34, 51, 0.12));
}

.seal-svg {
  width: 100%;
  height: 100%;
}

.seal-arc-text {
  fill: currentColor;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.seal-number {
  fill: var(--text-main);
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 52px;
}

.seal-percent {
  fill: currentColor;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.22em;
}
</style>
