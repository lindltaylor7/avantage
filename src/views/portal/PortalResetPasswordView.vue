<template>
  <div class="portal-auth-screen">
    <div class="portal-auth-card">
      <div class="portal-auth-mark">AG</div>
      <span class="portal-auth-eyebrow">Portal de cliente</span>

      <template v-if="!token">
        <h1 class="portal-auth-title">Link inválido</h1>
        <p class="portal-auth-subtitle">Este link de restablecimiento no trae token. Pide uno nuevo.</p>
        <router-link to="/portal/olvide-password" class="portal-auth-link">Pedir un nuevo link</router-link>
      </template>
      <template v-else-if="done">
        <h1 class="portal-auth-title">Contraseña actualizada</h1>
        <p class="portal-auth-subtitle">Ya puedes ingresar con tu nueva contraseña.</p>
        <router-link to="/portal/login" class="btn-primary portal-auth-submit">Ir a ingresar</router-link>
      </template>
      <template v-else>
        <h1 class="portal-auth-title">Elige una nueva contraseña</h1>

        <form @submit.prevent="handleSubmit" class="portal-auth-form">
          <div class="form-group">
            <label class="form-label">Nueva contraseña</label>
            <input v-model="password" type="password" class="form-input" placeholder="Mínimo 8 caracteres" required minlength="8" autofocus />
          </div>
          <div class="form-group">
            <label class="form-label">Confirma tu contraseña</label>
            <input v-model="confirmPassword" type="password" class="form-input" placeholder="Repite la contraseña" required minlength="8" />
          </div>

          <div v-if="errorMessage" class="portal-auth-error">{{ errorMessage }}</div>

          <button type="submit" class="btn-primary portal-auth-submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Guardando…' : 'Guardar contraseña' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const token = route.query.token || '';

const password = ref('');
const confirmPassword = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);
const done = ref(false);

async function handleSubmit() {
  errorMessage.value = '';
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Las contraseñas no coinciden.';
    return;
  }

  isSubmitting.value = true;
  try {
    const response = await fetch('/api/portal/restablecer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña.');
    done.value = true;
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.portal-auth-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background: var(--bg-dark);
  background-image:
    radial-gradient(at 50% 0%, rgba(111, 129, 37, 0.14) 0px, transparent 55%),
    radial-gradient(at 100% 100%, rgba(200, 85, 50, 0.07) 0px, transparent 50%);
}

.portal-auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.portal-auth-mark {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 1.1rem;
  margin-bottom: 1.1rem;
  box-shadow: var(--shadow-md);
}

.portal-auth-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 0.6rem;
}

.portal-auth-title {
  font-family: var(--font-heading);
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.4rem;
}

.portal-auth-subtitle {
  font-size: 0.92rem;
  color: var(--text-muted);
  margin-bottom: 2rem;
  max-width: 320px;
}

.portal-auth-form {
  width: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.portal-auth-submit {
  width: 100%;
  margin-top: 0.35rem;
  padding-top: 0.85rem;
  padding-bottom: 0.85rem;
  font-size: 1rem;
  text-align: center;
  text-decoration: none;
  display: inline-block;
}

.portal-auth-error {
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-md);
  background: rgba(200, 85, 50, 0.1);
  border: 1px solid rgba(200, 85, 50, 0.3);
  color: var(--accent-rose);
  font-size: 0.85rem;
}

.portal-auth-link {
  display: inline-block;
  margin-top: 1.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.portal-auth-link:hover {
  text-decoration: underline;
}
</style>
