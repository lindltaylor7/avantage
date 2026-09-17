<template>
  <div class="portal-auth-screen">
    <div class="portal-auth-card">
      <div class="portal-auth-mark">AG</div>
      <span class="portal-auth-eyebrow">Portal de cliente</span>
      <h1 class="portal-auth-title">Bienvenido de vuelta</h1>
      <p class="portal-auth-subtitle">Sigue el avance de tu proyecto y sube tus comprobantes desde aquí.</p>

      <form @submit.prevent="handleLogin" class="portal-auth-form">
        <div class="form-group">
          <label class="form-label">Correo electrónico</label>
          <input v-model="email" type="email" class="form-input" placeholder="tucorreo@ejemplo.com" required autofocus />
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input v-model="password" type="password" class="form-input" placeholder="••••••••" required />
        </div>

        <div v-if="errorMessage" class="portal-auth-error">{{ errorMessage }}</div>

        <button type="submit" class="btn-primary portal-auth-submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>

      <router-link to="/portal/olvide-password" class="portal-auth-link">¿Olvidaste tu contraseña?</router-link>

      <p class="portal-auth-note">
        El acceso al portal es por invitación: si tu proyecto ya empezó, te llegó un correo de
        Avantage Group para activarlo.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { setClientSession } from '../../clientAuth.js';

const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleLogin() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    const response = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

    setClientSession(data.token, data.client);
    router.push(route.query.redirect || '/portal');
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

.portal-auth-note {
  margin-top: 1.75rem;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-muted);
  max-width: 320px;
}
</style>
