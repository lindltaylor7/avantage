<template>
  <div class="portal-page">
    <router-link to="/portal" class="portal-back-link">← Mis proyectos</router-link>

    <div v-if="isLoading" class="portal-state-msg">Cargando tu proyecto…</div>
    <div v-else-if="errorMessage" class="portal-state-msg is-error">{{ errorMessage }}</div>

    <template v-else-if="project">
      <header class="portal-detail-header">
        <span class="portal-status-chip" :class="statusChipClass">{{ statusLabel }}</span>
        <h1 class="portal-detail-title">{{ project.topic }}</h1>
        <ProjectProgressStem :progress="project.progress_percentage" size="lg" />

        <p v-if="project.is_locked" class="portal-locked-banner">
          ⏳ Tu proyecto arranca apenas verifiquemos tu pago inicial de
          <strong>S/ {{ Number(project.initial_payment?.monto || 0).toFixed(2) }}</strong>.
          Sube el comprobante en la pestaña "Pagos" si todavía no lo hiciste.
        </p>
      </header>

      <nav class="portal-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="portal-tab-btn"
          :class="{ 'is-active': activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Resumen -->
      <section v-if="activeTab === 'resumen'" class="portal-tab-panel">
        <h2 class="portal-panel-title">Avance del proyecto</h2>
        <p v-if="tasks.length === 0" class="portal-panel-empty">Todavía no hay tareas registradas.</p>
        <ul v-else class="portal-task-list">
          <li v-for="task in tasks" :key="task.id" class="portal-task-item" :class="{ 'is-done': task.status === 'completado' }">
            <span class="portal-task-check">{{ task.status === 'completado' ? '✓' : '○' }}</span>
            <span class="portal-task-title">{{ task.title }}</span>
          </li>
        </ul>
      </section>

      <!-- Historial -->
      <section v-else-if="activeTab === 'historial'" class="portal-tab-panel">
        <h2 class="portal-panel-title">Línea de tiempo</h2>
        <p v-if="updates.length === 0" class="portal-panel-empty">Todavía no hay actualizaciones publicadas.</p>
        <ol v-else class="portal-timeline">
          <li v-for="update in updates" :key="update.id" class="portal-timeline-item">
            <span class="portal-timeline-date">{{ formatDateTime(update.created_at) }}</span>
            <p class="portal-timeline-content">{{ update.content }}</p>
            <button
              v-if="update.attachment_filename && !update.is_locked"
              type="button"
              class="portal-timeline-attachment"
              @click="openUpdateAttachment(update)"
            >
              📎 {{ update.attachment_original_name || 'Adjunto' }}
            </button>

            <!-- El documento ya está entregado, pero se habilita recién cuando
                 confirmamos el pago de la cuota con la que se liberó. -->
            <div v-else-if="update.attachment_filename" class="portal-timeline-locked">
              <span class="portal-locked-file">🔒 {{ update.attachment_original_name || 'Documento' }}</span>
              <p class="portal-locked-text">
                Se habilita al confirmar el pago de la <strong>cuota {{ update.unlock_cuota }}</strong>
                (S/ {{ Number(update.unlock_monto || 0).toFixed(2) }}).
                <template v-if="update.unlock_estado === 'pagado'">
                  Ya recibimos tu comprobante: lo estamos revisando.
                </template>
                <template v-else>
                  Sube tu comprobante en la pestaña "Pagos".
                </template>
              </p>
              <button type="button" class="portal-locked-cta" @click="activeTab = 'pagos'">Ir a Pagos →</button>
            </div>
          </li>
        </ol>
      </section>

      <!-- Pagos -->
      <section v-else class="portal-tab-panel">
        <h2 class="portal-panel-title">Pagos</h2>
        <p v-if="payments.length > 0" class="portal-payment-summary">
          Pagado y verificado <strong>S/ {{ paidTotal.toFixed(2) }}</strong>
          de S/ {{ plannedTotal.toFixed(2) }} en {{ payments.length }} cuota(s).
        </p>
        <p v-if="payments.length === 0" class="portal-panel-empty">Todavía no hay cuotas registradas para tu proyecto.</p>
        <div v-else class="portal-payment-list">
          <div v-for="payment in payments" :key="payment.id" class="portal-payment-card">
            <div class="portal-payment-top">
              <span class="portal-payment-cuota">Cuota {{ payment.cuota }}</span>
              <span class="portal-payment-chip" :class="paymentChipClass(payment.estado)">{{ paymentEstadoLabel(payment.estado) }}</span>
            </div>
            <div class="portal-payment-monto">S/ {{ Number(payment.monto).toFixed(2) }}</div>
            <div class="portal-payment-due" :class="{ 'is-overdue': isOverdue(payment) }">
              {{ payment.estado === 'verificado' ? 'Pagada' : 'Vence' }} el {{ formatDate(payment.due_date || payment.fecha) }}
              <span v-if="isOverdue(payment)">· vencida</span>
            </div>

            <div v-if="payment.receipts?.length" class="portal-receipt-list">
              <button
                v-for="receipt in payment.receipts"
                :key="receipt.id"
                type="button"
                class="portal-receipt-chip"
                :disabled="receipt.missing"
                @click="openReceipt(payment.id, receipt.id)"
              >
                {{ receipt.missing ? '⚠️ archivo perdido' : `📎 ${receipt.original_name || 'comprobante'}` }}
              </button>
            </div>

            <div v-if="payment.estado === 'pendiente'" class="portal-payment-upload">
              <label class="btn-primary portal-upload-btn" :class="{ 'is-disabled': uploadingId === payment.id }">
                {{ uploadingId === payment.id ? 'Subiendo…' : '📤 Subir comprobante' }}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  hidden
                  :disabled="uploadingId === payment.id"
                  @change="(event) => handleUpload(payment, event)"
                />
              </label>
              <p v-if="uploadErrors[payment.id]" class="portal-upload-error">{{ uploadErrors[payment.id] }}</p>
            </div>
            <p v-else-if="payment.estado === 'pagado'" class="portal-payment-note">
              Recibimos tu comprobante — está a la espera de que Finanzas lo verifique.
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { clientApiFetch } from '../../clientApiClient.js';
import ProjectProgressStem from '../../components/ProjectProgressStem.vue';

const route = useRoute();

const project = ref(null);
const tasks = ref([]);
const updates = ref([]);
const payments = ref([]);
const isLoading = ref(true);
const errorMessage = ref('');
const activeTab = ref('resumen');
const uploadingId = ref(null);
const uploadErrors = reactive({});

const tabs = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'historial', label: 'Historial' },
  { key: 'pagos', label: 'Pagos' }
];

const statusLabel = computed(() => {
  if (!project.value) return '';
  if (project.value.is_locked) return 'Por activar';
  if (project.value.status === 'Activo') return 'En marcha';
  return project.value.status;
});

const statusChipClass = computed(() => {
  if (!project.value) return '';
  if (project.value.is_locked) return 'is-pending';
  if (project.value.status === 'Activo') return 'is-active';
  return 'is-neutral';
});

function formatDateTime(value) {
  return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Las fechas del cronograma llegan como "YYYY-MM-DD": se arman en local. */
function formatDate(value) {
  if (!value) return 'fecha por definir';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 'fecha por definir';
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
}

function isOverdue(payment) {
  if (payment.estado === 'verificado') return false;
  const due = String(payment.due_date || payment.fecha || '').slice(0, 10);
  return Boolean(due) && due < new Date().toISOString().slice(0, 10);
}

const plannedTotal = computed(() => payments.value.reduce((sum, p) => sum + Number(p.monto || 0), 0));

const paidTotal = computed(() => payments.value
  .filter((p) => p.estado === 'verificado')
  .reduce((sum, p) => sum + Number(p.monto || 0), 0));

function paymentEstadoLabel(estado) {
  if (estado === 'verificado') return 'Verificado';
  if (estado === 'pagado') return 'En revisión';
  return 'Pendiente';
}

function paymentChipClass(estado) {
  if (estado === 'verificado') return 'is-verified';
  if (estado === 'pagado') return 'is-review';
  return 'is-pending';
}

async function loadProject() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const response = await clientApiFetch(`/api/portal/projects/${route.params.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el proyecto.');
    project.value = data.project;
    tasks.value = data.tasks || [];
    updates.value = data.updates || [];
    payments.value = data.payments || [];
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function handleUpload(payment, event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  uploadingId.value = payment.id;
  uploadErrors[payment.id] = '';
  try {
    const formData = new FormData();
    formData.append('receipts', file);
    const response = await clientApiFetch(`/api/portal/projects/${project.value.id}/payments/${payment.id}/receipts`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo subir el comprobante.');

    const target = payments.value.find((p) => p.id === payment.id);
    if (target) {
      target.receipts = [...(target.receipts || []), ...(data.receipts || [])];
      target.estado = 'pagado';
    }
  } catch (err) {
    uploadErrors[payment.id] = err.message;
  } finally {
    uploadingId.value = null;
  }
}

async function openBlob(url, fallbackName) {
  try {
    const response = await clientApiFetch(url);
    if (!response.ok) throw new Error('No se pudo abrir el archivo.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
  } catch (err) {
    console.error(`No se pudo abrir ${fallbackName}:`, err);
  }
}

function openReceipt(paymentId, receiptId) {
  openBlob(`/api/portal/projects/${project.value.id}/payments/${paymentId}/receipts/${receiptId}/file`, 'el comprobante');
}

function openUpdateAttachment(update) {
  openBlob(`/api/portal/projects/${project.value.id}/updates/${update.id}/attachment`, 'el adjunto');
}

onMounted(loadProject);
</script>

<style scoped>
.portal-back-link {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  margin-bottom: 1.1rem;
}

.portal-back-link:hover {
  color: var(--primary);
}

.portal-state-msg {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.portal-state-msg.is-error {
  color: var(--accent-rose);
}

/* Entregable retenido: se ve que existe y qué lo libera, pero no se descarga. */
.portal-timeline-locked {
  margin-top: 0.6rem;
  padding: 0.7rem 0.8rem;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-3);
}

.portal-locked-file {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--text-sub);
}

.portal-locked-text {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.portal-locked-cta {
  margin-top: 0.5rem;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--primary);
  cursor: pointer;
}

.portal-payment-summary {
  margin: 0 0 0.9rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.portal-payment-due {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.portal-payment-due.is-overdue {
  color: var(--accent-rose);
  font-weight: 600;
}

.portal-detail-header {
  padding: 1.3rem 1.3rem 1.45rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  margin-bottom: 1.1rem;
}

.portal-status-chip {
  display: inline-block;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.7rem;
}

.portal-status-chip.is-pending {
  background: rgba(222, 117, 75, 0.14);
  color: var(--accent-amber);
}

.portal-status-chip.is-active {
  background: rgba(111, 129, 37, 0.14);
  color: var(--primary);
}

.portal-status-chip.is-neutral {
  background: var(--surface-3);
  color: var(--text-sub);
}

.portal-detail-title {
  font-family: var(--font-heading);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.35;
  margin-bottom: 1.1rem;
}

.portal-locked-banner {
  margin-top: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  background: rgba(222, 117, 75, 0.1);
  border: 1px solid rgba(222, 117, 75, 0.25);
  color: var(--text-sub);
  font-size: 0.85rem;
  line-height: 1.55;
}

.portal-tabs {
  display: flex;
  gap: 0.4rem;
  padding: 0.3rem;
  background: var(--surface-2);
  border-radius: var(--radius-lg);
  margin-bottom: 1.1rem;
  position: sticky;
  top: 4.2rem;
  z-index: 5;
}

.portal-tab-btn {
  flex: 1;
  padding: 0.55rem 0.4rem;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.portal-tab-btn.is-active {
  background: var(--bg-card-solid);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.portal-panel-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.9rem;
}

.portal-panel-empty {
  font-size: 0.88rem;
  color: var(--text-muted);
  padding: 1rem 0;
}

.portal-task-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.portal-task-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.9rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.portal-task-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  border: 1.5px solid var(--border-strong);
  color: var(--text-muted);
}

.portal-task-item.is-done .portal-task-check {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--bg-dark);
}

.portal-task-title {
  font-size: 0.9rem;
  color: var(--text-main);
}

.portal-task-item.is-done .portal-task-title {
  color: var(--text-muted);
  text-decoration: line-through;
}

.portal-timeline {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.portal-timeline-item {
  padding: 0.9rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-md);
}

.portal-timeline-date {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.35rem;
}

.portal-timeline-content {
  font-size: 0.9rem;
  color: var(--text-main);
  line-height: 1.55;
  white-space: pre-line;
}

.portal-timeline-attachment {
  margin-top: 0.6rem;
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--primary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.portal-payment-list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.portal-payment-card {
  padding: 1.05rem 1.15rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.portal-payment-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.portal-payment-cuota {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.portal-payment-chip {
  padding: 0.24rem 0.65rem;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.portal-payment-chip.is-pending {
  background: rgba(222, 117, 75, 0.14);
  color: var(--accent-amber);
}

.portal-payment-chip.is-review {
  background: var(--surface-3);
  color: var(--text-sub);
}

.portal-payment-chip.is-verified {
  background: rgba(46, 125, 70, 0.14);
  color: var(--accent-emerald);
}

.portal-payment-monto {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.7rem;
}

.portal-receipt-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.7rem;
}

.portal-receipt-chip {
  padding: 0.35rem 0.65rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-sub);
  font-size: 0.76rem;
  cursor: pointer;
}

.portal-receipt-chip:disabled {
  color: var(--accent-rose);
  cursor: not-allowed;
}

.portal-payment-upload {
  margin-top: 0.4rem;
}

.portal-upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 100%;
  text-align: center;
}

.portal-upload-btn.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

.portal-upload-error {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--accent-rose);
}

.portal-payment-note {
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 0.4rem;
}

@media (min-width: 860px) {
  .portal-tabs {
    top: 5.5rem;
  }
}
</style>
