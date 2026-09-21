<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content send-modal">
      <div class="modal-header">
        <div class="send-modal-identity">
          <span class="send-modal-icon">🧾</span>
          <div>
            <h3 class="send-modal-title">Enviar comprobante de pago</h3>
            <p class="send-modal-sub">
              Ingreso {{ income.code }} · {{ conceptLabel }} · S/ {{ amountLabel }}
            </p>
          </div>
        </div>
        <button class="btn-secondary modal-close-btn" @click="close">✕ Cerrar</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Correo del cliente</label>
          <input v-model="to" type="email" class="form-input" placeholder="cliente@correo.com" />
          <p v-if="autofilled" class="send-hint">Prellenado con el correo del lead asociado.</p>
          <p v-else class="send-hint send-hint-warn">
            El lead no tiene correo registrado: escribe uno para poder enviarlo.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Mensaje (opcional)</label>
          <textarea
            v-model="message"
            class="form-textarea"
            rows="3"
            placeholder="Nota que acompaña al comprobante…"
          ></textarea>
          <p class="send-hint">El comprobante va en el cuerpo del correo, debajo de tu mensaje.</p>
        </div>

        <button type="button" class="preview-link" @click="openDocument">
          👁️ Ver el comprobante antes de enviarlo
        </button>

        <p v-if="errorMessage" class="info-box send-alert">⚠️ {{ errorMessage }}</p>
        <div v-if="result" class="info-box send-success">
          ✅ Comprobante enviado a {{ result.recipient }}.
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
        <button type="button" class="btn-primary" :disabled="isSending || !to.trim()" @click="send">
          {{ isSending ? "Enviando…" : "Enviar comprobante" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiFetch } from "../../apiClient.js";
import { openIncomeReceipt } from "./receiptDocument.js";

const props = defineProps({
  income: { type: Object, required: true },
});
const emit = defineEmits(["close"]);

const CUOTA_LABELS = { "1era": "Primer pago", "2da": "Segundo pago", "3era": "Tercer pago" };

const to = ref(props.income.lead_email || "");
const autofilled = ref(!!props.income.lead_email);
const message = ref("");
const isSending = ref(false);
const errorMessage = ref("");
const result = ref(null);

const conceptLabel = computed(() => CUOTA_LABELS[props.income.cuota] || props.income.cuota || "Pago");
const amountLabel = computed(() => Number(props.income.monto || 0).toFixed(2));

function close() {
  emit("close");
}

async function openDocument() {
  try {
    await openIncomeReceipt(props.income.id);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function send() {
  isSending.value = true;
  errorMessage.value = "";
  result.value = null;
  try {
    const response = await apiFetch(`/api/finance/income/${props.income.id}/receipt/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.value.trim(), message: message.value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo enviar el comprobante.");
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

.send-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: 0.35rem 0 0;
}

.send-hint-warn {
  color: var(--accent-amber, #b8860b);
}

.preview-link {
  background: none;
  border: none;
  padding: 0;
  margin-top: 0.4rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
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
