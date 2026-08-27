<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content send-modal">
      <div class="modal-header">
        <div class="send-modal-identity">
          <span class="send-modal-icon">📤</span>
          <div>
            <h3 class="send-modal-title">Enviar archivo tributario</h3>
            <p class="send-modal-sub">
              Ingreso {{ income.code }} ·
              {{ income.tributario_original_name || "archivo adjunto" }}
            </p>
          </div>
        </div>
        <button class="btn-secondary modal-close-btn" @click="close">✕ Cerrar</button>
      </div>

      <div class="modal-body">
        <div class="send-channel-toggle">
          <button
            type="button"
            class="channel-btn"
            :class="{ active: channel === 'email' }"
            @click="setChannel('email')"
          >
            ✉️ Correo
          </button>
          <button
            type="button"
            class="channel-btn"
            :class="{ active: channel === 'whatsapp' }"
            @click="setChannel('whatsapp')"
          >
            🟢 WhatsApp
          </button>
        </div>

        <div class="form-group">
          <label class="form-label">
            {{ channel === "email" ? "Correo del cliente" : "Número del cliente (con código de país)" }}
          </label>
          <input
            v-model="to"
            :type="channel === 'email' ? 'email' : 'text'"
            class="form-input"
            :placeholder="channel === 'email' ? 'cliente@correo.com' : '51987654321'"
          />
          <p v-if="autofilledFrom" class="send-hint">
            Prellenado con el dato del lead asociado.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Mensaje (opcional)</label>
          <textarea
            v-model="message"
            class="form-textarea"
            rows="3"
            :placeholder="channel === 'email' ? 'Texto del correo…' : 'Texto que acompaña al archivo…'"
          ></textarea>
        </div>

        <p v-if="errorMessage" class="info-box send-alert">⚠️ {{ errorMessage }}</p>
        <div v-if="result" class="info-box send-success">
          ✅ Enviado por {{ result.channel === "email" ? "correo" : "WhatsApp" }}
          <template v-if="result.recipient">a {{ result.recipient }}</template>.
          <a
            v-if="result.previewUrl"
            :href="result.previewUrl"
            target="_blank"
            rel="noopener"
            class="send-preview-link"
          >Ver correo (Ethereal) ↗</a>
        </div>
      </div>

      <div class="send-modal-footer">
        <button type="button" class="btn-secondary" @click="close">Cerrar</button>
        <button
          type="button"
          class="btn-primary"
          :disabled="isSending || !to.trim()"
          @click="send"
        >
          {{ isSending ? "Enviando…" : "Enviar" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { apiFetch } from "../../apiClient.js";

const props = defineProps({
  income: { type: Object, required: true },
});
const emit = defineEmits(["close"]);

const channel = ref(props.income.lead_email ? "email" : "whatsapp");
const to = ref("");
const message = ref("");
const isSending = ref(false);
const errorMessage = ref("");
const result = ref(null);
const autofilledFrom = ref(false);

function prefill() {
  const value =
    channel.value === "email"
      ? props.income.lead_email || ""
      : props.income.lead_phone || "";
  to.value = value;
  autofilledFrom.value = !!value;
}
prefill();

function setChannel(next) {
  if (channel.value === next) return;
  channel.value = next;
  result.value = null;
  errorMessage.value = "";
  prefill();
}

function close() {
  emit("close");
}

async function send() {
  isSending.value = true;
  errorMessage.value = "";
  result.value = null;
  try {
    const response = await apiFetch(
      `/api/finance/income/${props.income.id}/tributario/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channel.value,
          to: to.value.trim(),
          message: message.value.trim(),
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo enviar el archivo.");
    result.value = data.result;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSending.value = false;
  }
}
</script>

<style scoped>
.send-modal {
  max-width: 460px;
}

.send-modal-identity {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.send-modal-icon {
  font-size: 1.4rem;
}

.send-modal-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.send-modal-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.modal-close-btn {
  padding: 0.35rem 0.8rem;
  flex-shrink: 0;
}

.send-channel-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.1rem;
}

.channel-btn {
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-sub);
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.channel-btn.active {
  background: rgba(46, 125, 70, 0.12);
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
}

.send-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0.35rem 0 0;
}

.send-alert {
  border-color: rgba(200, 85, 50, 0.4);
  color: var(--accent-rose);
  margin-top: 0.75rem;
}

.send-success {
  border-color: rgba(46, 125, 70, 0.4);
  color: var(--accent-emerald);
  margin-top: 0.75rem;
}

.send-preview-link {
  display: inline-block;
  margin-left: 0.4rem;
  color: var(--primary);
  font-weight: 600;
}

.send-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.send-modal-footer .btn-primary,
.send-modal-footer .btn-secondary {
  width: auto;
  padding: 0.55rem 1.2rem;
}
</style>
