<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-header-identity">
          <span class="modal-header-icon">📩</span>
          <div>
            <h3 class="modal-header-title">Vista previa del correo enviado</h3>
            <p class="modal-header-sub">Destinatario: {{ emailStatus?.recipient || 'Correo destino' }}</p>
          </div>
        </div>

        <button class="btn-secondary modal-close-btn" @click="$emit('close')">
          ✕ Cerrar
        </button>
      </div>

      <div class="modal-body">
        <div v-if="emailStatus?.previewUrl" class="ethereal-banner">
          <span class="ethereal-banner-text">
            🌐 Correo capturado por Ethereal Mail
          </span>
          <a :href="emailStatus.previewUrl" target="_blank" rel="noopener" class="btn-primary ethereal-banner-link">
            Abrir en Ethereal Web ↗
          </a>
        </div>

        <!-- Render HTML iframe inside modal -->
        <iframe
          v-if="htmlContent"
          :srcdoc="htmlContent"
          class="modal-iframe"
          title="Vista Previa de Correo"
        ></iframe>
        <div v-else class="modal-loading">
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

<style scoped>
.modal-header-identity {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.modal-header-icon {
  font-size: 1.4rem;
}

.modal-header-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.modal-header-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.modal-close-btn {
  padding: 0.35rem 0.8rem;
  flex-shrink: 0;
}

.ethereal-banner {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(46, 125, 70, 0.14);
  border: 1px solid rgba(46, 125, 70, 0.35);
  border-radius: var(--radius-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.ethereal-banner-text {
  font-size: 0.85rem;
  color: var(--accent-emerald);
}

.ethereal-banner-link {
  font-size: 0.8rem;
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-sm);
  width: auto;
}

.modal-iframe {
  width: 100%;
  height: 500px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card-solid);
}

.modal-loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}
</style>
