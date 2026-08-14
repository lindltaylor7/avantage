<template>
  <main class="container" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 3rem 1.5rem;">
    <div class="glass-panel" style="width: 100%; max-width: 400px; padding: 2.25rem;">
      <div style="text-align: center; margin-bottom: 1.75rem;">
        <div class="logo-icon" style="margin: 0 auto 1rem auto;">AG</div>
        <h2 style="font-family: var(--font-heading); font-size: 1.4rem; color: var(--text-main); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.04em;">
          Acceso Interno
        </h2>
        <p style="font-family: var(--font-subheading); font-size: 0.85rem; color: var(--text-muted);">
          Avantage Group — Panel de Leads, Proyectos y administración
        </p>
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

        <div v-if="errorMessage" class="info-box" style="border-color: rgba(244, 63, 94, 0.4); margin-bottom: 1rem;">
          <p style="color: var(--accent-rose); margin: 0; font-size: 0.85rem;">{{ errorMessage }}</p>
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
