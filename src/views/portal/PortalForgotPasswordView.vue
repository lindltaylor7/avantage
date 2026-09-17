<template>
  <div class="portal-auth-screen">
    <div class="portal-auth-card">
      <div class="portal-auth-mark">AG</div>
      <span class="portal-auth-eyebrow">Portal de cliente</span>

      <template v-if="sent">
        <h1 class="portal-auth-title">Revisa tu correo</h1>
        <p class="portal-auth-subtitle">
          Si <strong>{{ email }}</strong> tiene una cuenta activa, te acabamos de mandar un link para
          elegir una nueva contraseña.
        </p>
        <router-link to="/portal/login" class="portal-auth-link">Volver a ingresar</router-link>
      </template>
      <template v-else>
        <h1 class="portal-auth-title">¿Olvidaste tu contraseña?</h1>
        <p class="portal-auth-subtitle">Escribe tu correo y te mandamos un link para elegir una nueva.</p>

        <form @submit.prevent="handleSubmit" class="portal-auth-form">
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input v-model="email" type="email" class="form-input" placeholder="tucorreo@ejemplo.com" required autofocus />
          </div>

          <button type="submit" class="btn-primary portal-auth-submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Enviando…' : 'Mandar link' }}
          </button>
        </form>

        <router-link to="/portal/login" class="portal-auth-link">Volver a ingresar</router-link>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const email = ref('');
const isSubmitting = ref(false);
const sent = ref(false);

async function handleSubmit() {
  isSubmitting.value = true;
  try {
    await fetch('/api/portal/olvide-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    });
  } finally {
    isSubmitting.value = false;
    sent.value = true;
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
