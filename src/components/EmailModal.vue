<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="font-size: 1.4rem;">📩</span>
          <div>
            <h3 style="font-family: var(--font-heading); font-size: 1.1rem; color: var(--text-main); margin: 0;">
              Vista Previa del Correo Enviado
            </h3>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">
              Destinatario: {{ emailStatus?.recipient || 'Correo Destino' }}
            </p>
          </div>
        </div>

        <button class="btn-secondary" style="padding: 0.3rem 0.75rem;" @click="$emit('close')">
          ✕ Cerrar
        </button>
      </div>

      <div class="modal-body">
        <div v-if="emailStatus?.previewUrl" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--accent-emerald);">
            🌐 Correo capturado por Ethereal Mail
          </span>
          <a :href="emailStatus.previewUrl" target="_blank" rel="noopener" class="btn-primary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; border-radius: 8px;">
            Abrir en Ethereal Web ↗
          </a>
        </div>

        <!-- Render HTML iframe inside modal -->
        <iframe
          v-if="htmlContent"
          :srcdoc="htmlContent"
          style="width: 100%; height: 500px; border: none; border-radius: 12px; background: #0F172A;"
          title="Vista Previa de Correo"
        ></iframe>
        <div v-else style="text-align: center; padding: 2rem; color: var(--text-muted);">
          Cargando vista previa del informe HTML...
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  emailStatus: {
    type: Object,
    default: null
  },
  htmlContent: {
    type: String,
    default: ''
  }
});

defineEmits(['close']);
</script>
