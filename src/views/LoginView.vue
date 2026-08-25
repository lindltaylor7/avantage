<template>
  <main class="container login-shell">
    <div class="glass-panel login-panel">
      <span class="login-eyebrow">Acceso restringido</span>
      <div class="login-head">
        <div class="logo-icon login-mark">AG</div>
        <h2 class="login-title">Acceso Interno</h2>
        <p class="login-subtitle">Avantage Group — Panel de Leads, Proyectos y administración</p>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">Correo electrónico</label>
          <input v-model="email" type="email" class="form-input" placeholder="admin@tesisperu.local" required autofocus />
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input v-model="password" type="password" class="form-input" placeholder="••••••••" required />
        </div>

        <div v-if="errorMessage" class="info-box login-error">
          <p class="login-error-text">{{ errorMessage }}</p>
        </div>

        <button type="submit" class="btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? 'Ingresando...' : 'Ingresar →' }}
        </button>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { setSession } from '../auth.js';

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
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

    setSession(data.token, data.user);
    router.push(route.query.redirect || '/dashboard');
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.login-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
}

.login-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.85rem;
}

.login-panel {
  width: 100%;
  max-width: 400px;
  padding: 2.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-head {
  text-align: center;
  margin-bottom: 1.75rem;
}

.login-mark {
  margin: 0 auto 1.1rem auto;
}

.login-title {
  font-family: var(--font-heading);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.4rem;
}

.login-subtitle {
  font-family: var(--font-subheading);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.login-panel form {
  width: 100%;
}

.login-error {
  border-color: rgba(178, 58, 69, 0.4);
  margin-bottom: 1rem;
}

.login-error-text {
  color: var(--accent-rose);
  margin: 0;
  font-size: 0.85rem;
}
</style>
