<template>
  <div class="login-split">
    <!-- Panel de marca -->
    <section class="login-hero">
      <div class="login-hero-bg-art"></div>
      <div class="login-hero-glow"></div>
      <div class="login-hero-ring"></div>

      <div class="login-hero-top">
        <div class="hero-logo-group">
          <div class="hero-logo-icon">AG</div>
          <div class="hero-logo-text">
            <span class="hero-logo-name">Avantage Group</span>
            <span class="hero-logo-tag">Panel interno</span>
          </div>
        </div>
      </div>

      <div class="login-hero-middle">
        <h1 class="doc-heading login-hero-headline">
          De la primera conversación al lead ganado.
        </h1>
        <p class="login-hero-sub">
          Leads, proyectos, campañas y finanzas de Avantage Group en un solo lugar — el mismo panel
          que usa el equipo para dar seguimiento a cada tesis, de principio a fin.
        </p>
      </div>

      <p class="login-hero-tagline">Research · Technology · Innovation · Growth</p>
    </section>

    <!-- Panel de acceso -->
    <section class="login-form-side">
      <div class="login-form-card">
        <span class="login-eyebrow">Acceso restringido</span>
        <h2 class="login-title">Iniciar sesión</h2>
        <p class="login-subtitle">Accede a tu panel de control de Avantage.</p>

        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <label class="form-label login-field-label">Correo electrónico</label>
            <input v-model="email" type="email" class="form-input" placeholder="admin@tesisperu.local" required autofocus />
          </div>
          <div class="form-group">
            <label class="form-label login-field-label">Contraseña</label>
            <input v-model="password" type="password" class="form-input" placeholder="••••••••" required />
          </div>

          <div v-if="errorMessage" class="info-box login-error">
            <p class="login-error-text">{{ errorMessage }}</p>
          </div>

          <button type="submit" class="btn-primary login-submit-btn" :disabled="isSubmitting">
            {{ isSubmitting ? 'Ingresando...' : 'Ingresar' }}
          </button>
        </form>
      </div>
    </section>
  </div>
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
.login-split {
  display: flex;
  min-height: 100vh;
  width: 100%;
}

/* Panel de marca — tono fijo (verde de vivero sobre tinta), a propósito
   independiente del toggle claro/oscuro: es un momento de marca, como una
   portada, no una superficie de la app. */
.login-hero {
  flex: 1 1 56%;
  position: relative;
  overflow: hidden;
  padding: 2.5rem 3.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(150deg, #0A0D0D 0%, #101414 48%, #3F4A1A 100%);
  color: #F7F8F1;
}

.login-hero-bg-art {
  position: absolute;
  inset: 0;
  background-image: url('/images/welcome_dashboard.jpg');
  background-size: cover;
  background-position: center;
  opacity: 0.12;
  mix-blend-mode: luminosity;
  filter: contrast(1.2) brightness(0.8);
  pointer-events: none;
}

.login-hero-glow {
  position: absolute;
  inset: -20% -10% auto auto;
  width: 60%;
  aspect-ratio: 1;
  background: radial-gradient(circle, rgba(158, 186, 75, 0.35) 0%, transparent 70%);
  pointer-events: none;
}

.login-hero-ring {
  position: absolute;
  right: -12%;
  bottom: -18%;
  width: 46%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1.5px dashed rgba(247, 248, 241, 0.16);
  pointer-events: none;
}

.login-hero-top,
.login-hero-middle,
.login-hero-tagline {
  position: relative;
  z-index: 1;
}

.hero-logo-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hero-logo-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  background: rgba(247, 248, 241, 0.12);
  border: 1px solid rgba(247, 248, 241, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 0.95rem;
  flex-shrink: 0;
}

.hero-logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.hero-logo-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
}

.hero-logo-tag {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(247, 248, 241, 0.6);
}

.login-hero-middle {
  max-width: 560px;
}

.login-hero-headline {
  font-size: clamp(2rem, 3.4vw, 2.9rem);
  line-height: 1.18;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 1.1rem;
}

.login-hero-sub {
  font-size: 1rem;
  line-height: 1.6;
  color: rgba(247, 248, 241, 0.78);
  max-width: 460px;
}

.login-hero-tagline {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(247, 248, 241, 0.55);
}

/* Panel de acceso — theme-aware, igual que el resto de la app */
.login-form-side {
  flex: 1 1 44%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 2.5rem;
  background: var(--bg-dark);
}

.login-form-card {
  width: 100%;
  max-width: 380px;
}

.login-eyebrow {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 0.85rem;
}

.login-title {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.4rem;
}

.login-subtitle {
  font-family: var(--font-subheading);
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 2rem;
}

.login-field-label {
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--text-sub);
}

.login-submit-btn {
  margin-top: 0.5rem;
}

.login-error {
  border-color: rgba(200, 85, 50, 0.4);
  margin-bottom: 1rem;
}

.login-error-text {
  color: var(--accent-rose);
  margin: 0;
  font-size: 0.85rem;
}

@media (max-width: 860px) {
  .login-split {
    flex-direction: column;
  }

  .login-hero {
    flex: 0 0 auto;
    padding: 2rem;
    min-height: 260px;
  }

  .login-hero-sub {
    display: none;
  }

  .login-form-side {
    padding: 2.5rem 1.5rem;
  }
}
</style>
