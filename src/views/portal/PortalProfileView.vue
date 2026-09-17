<template>
  <div class="portal-page">
    <header class="portal-page-header">
      <span class="portal-page-eyebrow">Tu cuenta</span>
      <h1 class="portal-page-title">Perfil</h1>
    </header>

    <div class="portal-profile-card">
      <div class="portal-profile-avatar">{{ initials }}</div>
      <div class="portal-profile-info">
        <span class="portal-profile-name">{{ clientAuthState.client?.name || 'Cliente Avantage Group' }}</span>
        <span class="portal-profile-email">{{ clientAuthState.client?.email }}</span>
      </div>
    </div>

    <p class="portal-profile-hint">
      ¿Necesitas actualizar tus datos o tienes dudas de tu proyecto? Escríbenos por WhatsApp a tu
      asesor de siempre.
    </p>

    <button type="button" class="btn-secondary portal-logout-full" @click="handleLogout">Cerrar sesión</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { clientAuthState, clearClientSession } from '../../clientAuth.js';

const router = useRouter();

const initials = computed(() => {
  const name = (clientAuthState.client?.name || clientAuthState.client?.email || '?').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[1][0]] : [name[0]];
  return letters.join('').toUpperCase();
});

function handleLogout() {
  clearClientSession();
  router.push('/portal/login');
}
</script>

<style scoped>
.portal-page-header {
  margin-bottom: 1.5rem;
}

.portal-page-eyebrow {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 0.35rem;
}

.portal-page-title {
  font-family: var(--font-heading);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-main);
}

.portal-profile-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  margin-bottom: 1.25rem;
}

.portal-profile-avatar {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--primary);
  color: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 1.1rem;
}

.portal-profile-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.portal-profile-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 1.02rem;
  color: var(--text-main);
}

.portal-profile-email {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.portal-profile-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 1.75rem;
}

.portal-logout-full {
  width: 100%;
}
</style>
