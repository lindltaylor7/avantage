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
          <p class="send-hint">Lo que escribas va al principio del correo.</p>
        </div>

        <!-- Adjuntos: arrastrar y soltar, o el clic de siempre. -->
        <div class="form-group">
          <label class="form-label">Archivos adjuntos</label>
          <div
            class="drop-zone"
            :class="{ 'is-dragging': isDragging, 'is-full': files.length >= MAX_FILES }"
            @dragover.prevent="isDragging = true"
            @dragenter.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
            @click="fileInput?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              multiple
              hidden
              @change="onPick"
            />
            <span class="drop-icon" aria-hidden="true">📎</span>
            <p class="drop-text">
              <strong>Arrastra aquí</strong> la boleta o factura, o haz clic para buscarla.
            </p>
            <p class="drop-sub">Hasta {{ MAX_FILES }} archivos de 10 MB cada uno.</p>
          </div>

          <ul v-if="files.length" class="file-list">
            <li v-for="(file, index) in files" :key="`${file.name}-${index}`" class="file-item">
              <span class="file-name" :title="file.name">{{ file.name }}</span>
              <span class="file-size">{{ formatSize(file.size) }}</span>
              <button type="button" class="file-remove" title="Quitar el archivo" @click.stop="removeFile(index)">
                ✕
              </button>
            </li>
          </ul>
        </div>

        <!-- El comprobante que arma el sistema es opcional: cuando se manda la
             boleta real, duplicar constancias del mismo pago solo confunde. -->
        <label class="doc-toggle">
          <input v-model="includeDocument" type="checkbox" :disabled="!isVerified" />
          <span>
            Incluir el comprobante que genera el sistema
            <em v-if="!isVerified">— necesita que el ingreso esté verificado por Finanzas</em>
          </span>
        </label>
        <p v-if="includeDocument && files.length" class="send-hint">
          Se enviarán los dos: el comprobante generado y tus {{ files.length }} archivo(s).
          Desmarca la casilla si solo quieres mandar los tuyos.
        </p>
        <p v-else-if="!includeDocument && !files.length" class="send-hint send-hint-warn">
          Sin el comprobante generado ni archivos adjuntos, el correo lleva solo tu mensaje.
        </p>

        <p v-if="includeDocument" class="send-hint">
          Se adjunta como PDF (<strong>{{ pdfName }}</strong>), para que el cliente lo guarde o lo presente donde se lo pidan.
        </p>
        <button v-if="includeDocument" type="button" class="preview-link" @click="openDocument">
          👁️ Ver el PDF antes de enviarlo
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
        <button type="button" class="btn-primary" :disabled="isSending || !canSend" @click="send">
          {{ isSending ? "Enviando…" : sendLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiFetch } from "../../apiClient.js";
import { openIncomeReceiptPdf } from "./receiptDocument.js";

const props = defineProps({
  income: { type: Object, required: true },
});
const emit = defineEmits(["close"]);

const CUOTA_LABELS = { "1era": "Primer pago", "2da": "Segundo pago", "3era": "Tercer pago" };

const MAX_FILES = 5;

const to = ref(props.income.lead_email || "");
const autofilled = ref(!!props.income.lead_email);
const message = ref("");
const files = ref([]);
const isDragging = ref(false);
const fileInput = ref(null);
const isSending = ref(false);
const errorMessage = ref("");
const result = ref(null);

// El comprobante generado certifica el pago, así que solo se puede mandar
// sobre un ingreso verificado: si no lo está, el correo nace sin él.
const isVerified = props.income.estado === "verificado";
const includeDocument = ref(isVerified);

/** Mismo nombre que arma el backend: CP-<año>-<id a 4 dígitos>. */
const pdfName = computed(() => {
  const year = new Date(props.income.fecha || Date.now()).getFullYear();
  return `Comprobante-CP-${year}-${String(props.income.id).padStart(4, "0")}.pdf`;
});

const conceptLabel = computed(() => CUOTA_LABELS[props.income.cuota] || props.income.cuota || "Pago");
const amountLabel = computed(() => Number(props.income.monto || 0).toFixed(2));

/** Un correo vacío no se manda: algo tiene que llevar además del destinatario. */
const canSend = computed(() =>
  Boolean(to.value.trim()) &&
  (includeDocument.value || files.value.length > 0 || message.value.trim()));

const sendLabel = computed(() => {
  if (includeDocument.value) return "Enviar comprobante";
  return files.value.length > 0 ? "Enviar archivos" : "Enviar correo";
});

function addFiles(incoming) {
  const room = MAX_FILES - files.value.length;
  if (room <= 0) {
    errorMessage.value = `Solo se pueden adjuntar ${MAX_FILES} archivos por correo.`;
    return;
  }
  const accepted = incoming.filter((file) => {
    if (file.size > 10 * 1024 * 1024) {
      errorMessage.value = `"${file.name}" pasa de 10 MB y no se puede adjuntar.`;
      return false;
    }
    return true;
  });
  files.value = [...files.value, ...accepted.slice(0, room)];
}

function onDrop(event) {
  isDragging.value = false;
  errorMessage.value = "";
  addFiles(Array.from(event.dataTransfer?.files || []));
}

function onPick(event) {
  errorMessage.value = "";
  addFiles(Array.from(event.target.files || []));
  event.target.value = "";
}

function removeFile(index) {
  files.value.splice(index, 1);
}

function formatSize(bytes) {
  const kb = (Number(bytes) || 0) / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function close() {
  emit("close");
}

async function openDocument() {
  try {
    await openIncomeReceiptPdf(props.income.id);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function send() {
  isSending.value = true;
  errorMessage.value = "";
  result.value = null;
  try {
    // Va como multipart porque el correo puede llevar archivos; el
    // Content-Type lo pone el navegador con su boundary.
    const formData = new FormData();
    formData.append("to", to.value.trim());
    formData.append("message", message.value.trim());
    formData.append("includeDocument", String(includeDocument.value));
    for (const file of files.value) formData.append("attachments", file);

    const response = await apiFetch(`/api/finance/income/${props.income.id}/receipt/send`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo enviar el comprobante.");
    result.value = data.result;
    files.value = [];
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

/* Zona de arrastre de adjuntos. Todo el bloque es clicable, así que quien no
   arrastre archivos llega al selector de siempre. */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 1.1rem 0.9rem;
  border: 1.5px dashed var(--border-strong, var(--border-color));
  border-radius: var(--radius-md);
  background: var(--surface-2, transparent);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.drop-zone:hover { border-color: var(--primary); }

.drop-zone.is-dragging {
  border-color: var(--primary);
  border-style: solid;
  background: rgba(16, 94, 255, 0.06);
}

.drop-zone.is-full { opacity: 0.55; }

.drop-icon { font-size: 1.3rem; line-height: 1; }

.drop-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-sub);
}

.drop-text strong { color: var(--text-main); }

.drop-sub {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.file-list {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.file-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.76rem;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
}

.file-size {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
}

.file-remove {
  background: none;
  border: none;
  padding: 0 0.15rem;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
}

.file-remove:hover { color: var(--accent-rose); }

.doc-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-sub);
  cursor: pointer;
}

.doc-toggle input { margin-top: 0.15rem; flex-shrink: 0; }
.doc-toggle em { font-style: normal; font-size: 0.72rem; color: var(--text-muted); }

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
