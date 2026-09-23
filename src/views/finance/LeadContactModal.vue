<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content contact-modal">
      <div class="modal-header">
        <div>
          <h3 class="contact-title">👤 Datos del cliente</h3>
          <p class="contact-sub">Son los que salen impresos en su comprobante de pago.</p>
        </div>
        <button class="btn-secondary modal-close-btn" @click="emit('close')">✕ Cerrar</button>
      </div>

      <div class="modal-body">
        <p v-if="isLoading" class="contact-state">Cargando los datos…</p>

        <form v-else @submit.prevent="save">
          <div class="form-group">
            <label class="form-label">Nombre completo</label>
            <input v-model="draft.fullName" type="text" class="form-input" placeholder="Nombre y apellidos" />
          </div>
          <div class="form-group">
            <label class="form-label">DNI</label>
            <input v-model="draft.dni" type="text" class="form-input" placeholder="8 dígitos" />
          </div>
          <div class="form-group">
            <label class="form-label">Correo</label>
            <input v-model="draft.email" type="email" class="form-input" placeholder="cliente@correo.com" />
            <p class="contact-hint">Es a donde se manda el comprobante en PDF.</p>
          </div>
          <div class="form-group">
            <label class="form-label">Celular</label>
            <input v-model="draft.phone" type="text" class="form-input" placeholder="+51 9…" />
          </div>

          <p v-if="errorMessage" class="contact-error">⚠️ {{ errorMessage }}</p>

          <div class="contact-actions">
            <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="isSaving">
              {{ isSaving ? "Guardando…" : "Guardar datos" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiFetch } from "../../apiClient.js";

const props = defineProps({
  leadId: { type: [Number, String], required: true },
});
const emit = defineEmits(["close", "saved"]);

const draft = reactive({ fullName: "", dni: "", email: "", phone: "" });
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref("");

/**
 * Los datos se releen del servidor en vez de tomarse de la fila del libro: la
 * tabla de Finanzas solo trae el nombre y el DNI, y acá se editan también el
 * correo y el celular.
 */
onMounted(async () => {
  try {
    const response = await apiFetch(`/api/finance/leads/${props.leadId}/contact`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar los datos del cliente.");
    Object.assign(draft, {
      fullName: data.lead.full_name || "",
      dni: data.lead.dni || "",
      email: data.lead.email || "",
      phone: data.lead.phone || "",
    });
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
});

async function save() {
  isSaving.value = true;
  errorMessage.value = "";
  try {
    const response = await apiFetch(`/api/finance/leads/${props.leadId}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron guardar los datos.");
    emit("saved", data.lead);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.contact-modal {
  max-width: 420px;
}

.contact-title {
  font-family: var(--font-heading);
  font-size: 1rem;
  color: var(--text-main);
  margin: 0;
}

.contact-sub {
  font-size: 0.76rem;
  color: var(--text-muted);
  margin: 0.2rem 0 0;
}

.contact-state {
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: 1rem 0;
}

.contact-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 0.3rem;
}

.contact-error {
  font-size: 0.8rem;
  color: var(--accent-rose);
  margin-bottom: 0.6rem;
}

.contact-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
</style>
