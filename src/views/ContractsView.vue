<template>
  <main class="contracts-page">
    <header class="page-header">
      <div>
        <span class="page-eyebrow">Contratos</span>
        <h2 class="section-heading">📄 Gestión de contratos</h2>
        <p class="section-subheading">Genera contratos para los clientes del funnel, ajusta sus cláusulas e imprímelos en A4.</p>
      </div>
    </header>

    <p v-if="errorMessage" class="info-box ct-alert">⚠️ {{ errorMessage }}</p>

    <div class="ct-layout">
      <!-- Lista + nuevo contrato -->
      <aside class="glass-panel ct-sidebar">
        <form class="ct-new" @submit.prevent="createContract">
          <h3 class="ct-panel-title">Nuevo contrato</h3>
          <div class="form-group">
            <label class="form-label">Cliente del funnel</label>
            <select v-model="newContract.leadId" class="form-select" required>
              <option value="" disabled>Selecciona un cliente…</option>
              <option v-for="lead in clientLeads" :key="lead.id" :value="lead.id">
                {{ lead.full_name || lead.phone || `Lead #${lead.id}` }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de contrato</label>
            <select v-model="newContract.templateKey" class="form-select">
              <option v-for="t in templates" :key="t.key" :value="t.key">{{ t.label }}</option>
            </select>
          </div>
          <button type="submit" class="btn-primary ct-full" :disabled="isCreating || !newContract.leadId">
            {{ isCreating ? 'Creando…' : '+ Crear contrato' }}
          </button>
        </form>

        <div class="ct-list-head">
          <h3 class="ct-panel-title">Contratos ({{ filteredContracts.length }})</h3>
          <input v-model="search" type="search" class="form-input" placeholder="Buscar por cliente o número…" />
        </div>

        <div v-if="isLoading" class="empty-state"><p>Cargando…</p></div>
        <div v-else-if="filteredContracts.length === 0" class="empty-state">
          <p class="empty-state-title">Sin contratos</p>
          <p class="empty-state-text">Crea el primero desde el formulario de arriba.</p>
        </div>
        <ul v-else class="ct-list">
          <li v-for="c in filteredContracts" :key="c.id">
            <button type="button" class="ct-item" :class="{ 'is-active': editing?.id === c.id }" @click="selectContract(c.id)">
              <span class="ct-item-number">{{ contractNumber(c) }}</span>
              <span class="ct-item-client">{{ c.client_name || c.lead_name || 'Sin cliente' }}</span>
              <span class="ct-status" :class="`is-${c.status}`">{{ STATUS_LABELS[c.status] }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Editor -->
      <section v-if="editing" class="glass-panel ct-editor">
        <div class="ct-toolbar">
          <div>
            <span class="ct-item-number">{{ contractNumber(editing) }}</span>
            <span v-if="isDirty" class="ct-dirty">● Cambios sin guardar</span>
          </div>
          <div class="ct-actions">
            <button type="button" class="btn-secondary" :disabled="isSaving" @click="openDocument">🖨️ Imprimir / PDF</button>
            <button type="button" class="btn-primary" :disabled="isSaving || !isDirty" @click="save">
              {{ isSaving ? 'Guardando…' : 'Guardar' }}
            </button>
            <button type="button" class="btn-secondary ct-danger" :disabled="isSaving" @click="remove">Eliminar</button>
          </div>
        </div>

        <div class="ct-grid">
          <div class="form-group ct-wide">
            <label class="form-label">Título del contrato</label>
            <input v-model="editing.title" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select v-model="editing.status" class="form-select">
              <option v-for="(label, key) in STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
        </div>

        <h3 class="ct-section-title">Datos de las partes</h3>
        <div class="ct-grid">
          <div class="form-group"><label class="form-label">Cliente</label><input v-model="editing.client_name" class="form-input" /></div>
          <div class="form-group"><label class="form-label">DNI</label><input v-model="editing.client_dni" class="form-input" /></div>
          <div class="form-group ct-wide"><label class="form-label">Domicilio</label><input v-model="editing.client_address" class="form-input" /></div>
          <div class="form-group"><label class="form-label">Correo</label><input v-model="editing.client_email" type="email" class="form-input" /></div>
          <div class="form-group"><label class="form-label">Teléfono</label><input v-model="editing.client_phone" class="form-input" /></div>
          <div class="form-group"><label class="form-label">Representante de la empresa</label><input v-model="editing.representative_name" class="form-input" /></div>
          <div class="form-group"><label class="form-label">Ciudad</label><input v-model="editing.city" class="form-input" /></div>
          <div class="form-group"><label class="form-label">Fecha del contrato</label><input v-model="editing.contract_date" type="date" class="form-input" /></div>
          <div class="form-group ct-amount">
            <label class="form-label">Monto total</label>
            <div class="ct-amount-row">
              <select v-model="editing.currency" class="form-select"><option value="PEN">S/</option><option value="USD">US$</option></select>
              <input v-model="editing.total_amount" type="number" min="0" step="0.01" class="form-input" />
            </div>
          </div>
          <div class="form-group ct-wide">
            <label class="form-label">Servicio contratado</label>
            <textarea v-model="editing.service_description" class="form-textarea" rows="2"></textarea>
          </div>
        </div>

        <div class="ct-clauses-head">
          <h3 class="ct-section-title">Cláusulas ({{ editing.clauses.length }})</h3>
          <p class="ct-hint">
            Marcadores que se completan solos en el documento:
            <code v-for="tag in PLACEHOLDER_TAGS" :key="tag" v-text="tag"></code>
          </p>
        </div>

        <ol class="ct-clauses">
          <li v-for="(clause, i) in editing.clauses" :key="clause.key" class="ct-clause">
            <div class="ct-clause-head">
              <span class="ct-clause-number">{{ i + 1 }}</span>
              <input v-model="clause.title" class="form-input" placeholder="Título de la cláusula" />
              <div class="ct-clause-actions">
                <button type="button" title="Subir" :disabled="i === 0" @click="moveClause(i, -1)">↑</button>
                <button type="button" title="Bajar" :disabled="i === editing.clauses.length - 1" @click="moveClause(i, 1)">↓</button>
                <button type="button" title="Quitar" class="ct-remove" @click="editing.clauses.splice(i, 1)">✕</button>
              </div>
            </div>
            <textarea v-model="clause.body" class="form-textarea" rows="4" placeholder="Texto de la cláusula"></textarea>
          </li>
        </ol>

        <div class="ct-add">
          <button type="button" class="btn-secondary" @click="addClause()">+ Cláusula en blanco</button>
          <select v-if="missingTemplateClauses.length" class="form-select" value="" @change="addTemplateClause($event)">
            <option value="" disabled>+ Recuperar cláusula de la plantilla…</option>
            <option v-for="c in missingTemplateClauses" :key="c.title" :value="c.title">{{ c.title }}</option>
          </select>
        </div>
      </section>

      <section v-else class="glass-panel ct-editor empty-state">
        <p class="empty-state-title">Selecciona o crea un contrato</p>
        <p class="empty-state-text">Aquí podrás editar sus datos y cláusulas antes de imprimirlo.</p>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '../apiClient.js';

const STATUS_LABELS = { borrador: 'Borrador', firmado: 'Firmado', anulado: 'Anulado' };
const PLACEHOLDER_TAGS = ['cliente', 'dni', 'domicilio', 'correo', 'telefono', 'servicio', 'monto', 'ciudad', 'fecha', 'representante', 'empresa', 'ruc']
  .map((key) => `{{${key}}}`);
const EDITABLE = ['title', 'status', 'client_name', 'client_dni', 'client_address', 'client_email', 'client_phone',
  'service_description', 'total_amount', 'currency', 'city', 'contract_date', 'representative_name'];

const route = useRoute();
const contracts = ref([]);
const clientLeads = ref([]);
const templates = ref([]);
const editing = ref(null);
const savedSnapshot = ref('');
const search = ref('');
const newContract = ref({ leadId: route.query.leadId ? Number(route.query.leadId) : '', templateKey: 'cliente' });
const isLoading = ref(true);
const isCreating = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');

let clauseKey = 0;
const withKeys = (clauses) => clauses.map((c) => ({ title: c.title, body: c.body, key: ++clauseKey }));

const snapshot = (c) => JSON.stringify([EDITABLE.map((f) => c[f] ?? ''), c.clauses.map((x) => [x.title, x.body])]);
const isDirty = computed(() => !!editing.value && snapshot(editing.value) !== savedSnapshot.value);

const filteredContracts = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return contracts.value;
  return contracts.value.filter((c) =>
    [contractNumber(c), c.client_name, c.lead_name].some((v) => String(v || '').toLowerCase().includes(q)));
});

const missingTemplateClauses = computed(() => {
  if (!editing.value) return [];
  const template = templates.value.find((t) => t.key === editing.value.template_key);
  const present = new Set(editing.value.clauses.map((c) => c.title.trim().toUpperCase()));
  return (template?.clauses || []).filter((c) => !present.has(c.title.toUpperCase()));
});

function contractNumber(c) {
  const year = c.created_at ? new Date(c.created_at).getFullYear() : new Date().getFullYear();
  return `CTR-${year}-${String(c.id).padStart(4, '0')}`;
}

async function request(url, options = {}) {
  const response = await apiFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de servidor.');
  return data;
}

async function run(task) {
  errorMessage.value = '';
  try {
    return await task();
  } catch (err) {
    errorMessage.value = err.message;
    return null;
  }
}

function load(contract) {
  editing.value = { ...contract, clauses: withKeys(contract.clauses || []) };
  savedSnapshot.value = snapshot(editing.value);
}

async function refreshList() {
  contracts.value = await request('/api/contracts');
}

function confirmDiscard() {
  return !isDirty.value || confirm('Hay cambios sin guardar en el contrato actual. ¿Descartarlos?');
}

async function selectContract(id) {
  if (editing.value?.id === id || !confirmDiscard()) return;
  await run(async () => load(await request(`/api/contracts/${id}`)));
}

async function createContract() {
  if (!confirmDiscard()) return;
  isCreating.value = true;
  await run(async () => {
    const contract = await request('/api/contracts', { method: 'POST', body: JSON.stringify(newContract.value) });
    load(contract);
    await refreshList();
  });
  isCreating.value = false;
}

async function save() {
  isSaving.value = true;
  const ok = await run(async () => {
    const payload = {
      title: editing.value.title,
      status: editing.value.status,
      clientName: editing.value.client_name,
      clientDni: editing.value.client_dni,
      clientAddress: editing.value.client_address,
      clientEmail: editing.value.client_email,
      clientPhone: editing.value.client_phone,
      serviceDescription: editing.value.service_description,
      totalAmount: editing.value.total_amount,
      currency: editing.value.currency,
      city: editing.value.city,
      contractDate: editing.value.contract_date,
      representativeName: editing.value.representative_name,
      clauses: editing.value.clauses.map(({ title, body }) => ({ title, body }))
    };
    load(await request(`/api/contracts/${editing.value.id}`, { method: 'PUT', body: JSON.stringify(payload) }));
    await refreshList();
    return true;
  });
  isSaving.value = false;
  return !!ok;
}

async function remove() {
  if (!confirm(`¿Eliminar el contrato ${contractNumber(editing.value)}? Esta acción no se puede deshacer.`)) return;
  await run(async () => {
    await request(`/api/contracts/${editing.value.id}`, { method: 'DELETE' });
    editing.value = null;
    await refreshList();
  });
}

/**
 * Abre el documento A4 en una pestaña nueva. La pestaña se abre ANTES de la
 * llamada a la API (en el mismo clic) para que el navegador no la bloquee
 * como ventana emergente; si hay cambios sin guardar, se guardan primero
 * para que el documento refleje lo que se ve en pantalla.
 */
async function openDocument() {
  const win = window.open('', '_blank');
  if (isDirty.value && !(await save())) {
    win?.close();
    return;
  }
  await run(async () => {
    const response = await apiFetch(`/api/contracts/${editing.value.id}/document`);
    if (!response.ok) throw new Error('No se pudo generar el documento.');
    const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/html' }));
    if (win) {
      win.location.href = url;
    } else {
      // El navegador bloqueó la pestaña: se descarga el archivo.
      const link = document.createElement('a');
      link.href = url;
      link.download = `${contractNumber(editing.value)}.html`;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

function addClause(clause = { title: '', body: '' }) {
  editing.value.clauses.push(...withKeys([clause]));
}

function addTemplateClause(event) {
  const clause = missingTemplateClauses.value.find((c) => c.title === event.target.value);
  if (clause) addClause(clause);
  event.target.value = '';
}

function moveClause(index, delta) {
  const list = editing.value.clauses;
  [list[index], list[index + delta]] = [list[index + delta], list[index]];
}

onMounted(async () => {
  await run(async () => {
    [templates.value, clientLeads.value] = await Promise.all([
      request('/api/contract-templates'),
      request('/api/contracts/client-leads'),
      refreshList()
    ]);
  });
  isLoading.value = false;
});
</script>

<style scoped>
.contracts-page { padding: 24px; }
.ct-alert { margin-bottom: 16px; }
.ct-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
.ct-sidebar, .ct-editor { padding: 20px; }
.ct-panel-title, .ct-section-title { font-size: 0.95rem; font-weight: 600; color: var(--text-main); margin: 0 0 12px; }
.ct-section-title { margin-top: 20px; }
.ct-full { width: 100%; }
.ct-new { padding-bottom: 18px; border-bottom: 1px solid var(--border-color); margin-bottom: 18px; }
.ct-list-head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }

.ct-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow-y: auto; }
.ct-item { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; padding: 10px 12px;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; font: inherit; }
.ct-item:hover { background: var(--bg-card-hover); }
.ct-item.is-active { border-color: var(--primary); box-shadow: 0 0 0 2px var(--border-glow); }
.ct-item-number { font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); }
.ct-item-client { grid-column: 1; font-weight: 500; color: var(--text-main); }
.ct-status { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-size: 0.72rem; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
.ct-status.is-borrador { background: #f3ecd9; color: #8a6414; }
.ct-status.is-firmado { background: #e1efe4; color: var(--accent-emerald); }
.ct-status.is-anulado { background: #f6e1db; color: var(--accent-rose); }

.ct-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.ct-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ct-dirty { margin-left: 10px; font-size: 0.8rem; color: var(--cta); }
.ct-danger { color: var(--accent-rose); }

.ct-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.ct-wide { grid-column: 1 / -1; }
.ct-amount-row { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }

.ct-clauses-head { display: flex; flex-direction: column; gap: 4px; }
.ct-hint { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 12px; line-height: 1.8; }
.ct-hint code { font-family: var(--font-mono); font-size: 0.75rem; background: var(--bg-page-alt); padding: 1px 6px; border-radius: 4px; margin-left: 4px; }

.ct-clauses { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ct-clause { padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); display: flex; flex-direction: column; gap: 8px; }
.ct-clause-head { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; }
.ct-clause-number { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--primary); color: #fff; font-size: 0.8rem; font-weight: 600; }
.ct-clause-actions { display: flex; gap: 4px; }
.ct-clause-actions button { width: 30px; height: 30px; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: var(--radius-sm); cursor: pointer; }
.ct-clause-actions button:disabled { opacity: 0.35; cursor: default; }
.ct-clause-actions .ct-remove { color: var(--accent-rose); }

.ct-add { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.ct-add .form-select { max-width: 320px; }

@media (max-width: 960px) {
  .ct-layout { grid-template-columns: 1fr; }
  .ct-grid { grid-template-columns: 1fr; }
}
</style>
