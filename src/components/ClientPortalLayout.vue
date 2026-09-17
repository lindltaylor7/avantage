<template>
  <div class="portal-shell">
    <header class="portal-topbar">
      <div class="portal-topbar-brand">
        <div class="portal-brand-mark">AG</div>
        <div class="portal-brand-text">
          <span class="portal-brand-name">Avantage Group</span>
          <span class="portal-brand-tag">Portal de cliente</span>
        </div>
      </div>

      <nav class="portal-topbar-nav">
        <router-link to="/portal" class="portal-topbar-link" :class="{ 'is-active': isProjectsActive }">Mis proyectos</router-link>
        <router-link to="/portal/perfil" class="portal-topbar-link" :class="{ 'is-active': route.path === '/portal/perfil' }">Perfil</router-link>
      </nav>

      <button type="button" class="portal-logout-btn" @click="handleLogout">Salir</button>
    </header>

    <main class="portal-content">
      <slot />
    </main>

    <nav class="portal-tabbar" aria-label="Navegación del portal">
      <router-link to="/portal" class="portal-tab" :class="{ 'is-active': isProjectsActive }">
        <span class="portal-tab-icon">🌱</span>
        <span class="portal-tab-label">Proyectos</span>
      </router-link>
      <router-link to="/portal/perfil" class="portal-tab" :class="{ 'is-active': route.path === '/portal/perfil' }">
        <span class="portal-tab-icon">👤</span>
        <span class="portal-tab-label">Perfil</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clientAuthState, clearClientSession } from '../clientAuth.js';

const route = useRoute();
const router = useRouter();

const isProjectsActive = computed(() => route.path === '/portal' || route.path.startsWith('/portal/proyectos'));

function handleLogout() {
  clearClientSession();
  router.push('/portal/login');
}
</script>

<style scoped>
.portal-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-dark);
  background-image:
    radial-gradient(at 0% 0%, rgba(111, 129, 37, 0.08) 0px, transparent 55%),
    radial-gradient(at 100% 0%, rgba(200, 85, 50, 0.05) 0px, transparent 50%);
  background-attachment: fixed;
}

.portal-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  background: var(--bg-card-solid);
  border-bottom: 1px solid var(--border-color);
}

.portal-topbar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
}

.portal-brand-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--bg-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 0.8rem;
}

.portal-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}

.portal-brand-name {
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.portal-brand-tag {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.portal-topbar-nav {
  display: none;
  gap: 0.4rem;
}

.portal-topbar-link {
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.portal-topbar-link:hover {
  background: var(--surface-2);
  color: var(--text-main);
}

.portal-topbar-link.is-active {
  background: var(--surface-3);
  color: var(--primary);
}

.portal-logout-btn {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.portal-logout-btn:hover {
  border-color: var(--accent-rose);
  color: var(--accent-rose);
}

.portal-content {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.25rem 1rem 6rem;
}

/* Bottom tab bar — la navegación principal en mobile, el patrón app-like
   que pidió el cliente. En desktop se retira a favor del nav del topbar. */
.portal-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  background: var(--bg-card-solid);
  border-top: 1px solid var(--border-color);
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.portal-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.55rem 0 0.5rem;
  text-decoration: none;
  color: var(--text-muted);
}

.portal-tab-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.portal-tab-label {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.portal-tab.is-active {
  color: var(--primary);
}

.portal-tab.is-active .portal-tab-icon {
  transform: translateY(-1px);
}

@media (min-width: 860px) {
  .portal-topbar-nav {
    display: flex;
  }

  .portal-tabbar {
    display: none;
  }

  .portal-content {
    padding: 2rem 1.5rem 3rem;
  }
}
</style>
