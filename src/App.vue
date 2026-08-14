<template>
  <div id="app">
    <!-- Admin Layout with Sidebar & Navbar for Dashboard / Admin pages -->
    <AdminLayout v-if="isAdminRoute">
      <router-view />
    </AdminLayout>

    <!-- Public Layout for Home & Login -->
    <template v-else>
      <header class="site-header">
        <div class="container header-inner">
          <router-link to="/" class="logo-group">
            <div class="logo-icon">AG</div>
            <div class="logo-text">
              <h1>Avantage Group</h1>
              <p>Investigación · Software · Marketing</p>
            </div>
          </router-link>

          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <template v-if="authState.token">
              <router-link to="/dashboard" class="btn-primary" style="text-decoration: none; font-size: 0.85rem; padding: 0.5rem 1.1rem; width: auto;">
                🧭 Dashboard Admin
              </router-link>
              <button type="button" class="btn-secondary" style="font-size: 0.85rem;" @click="handleLogout">
                Salir
              </button>
            </template>
            <router-link v-else to="/login" class="btn-secondary" style="text-decoration: none; font-size: 0.85rem;">
              🔐 Acceso Admin
            </router-link>

            <div class="status-badge">
              <div class="dot-pulse"></div>
              <span>Node.js Backend Activo</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Public Routed View -->
      <router-view />

      <!-- Public Footer -->
      <footer class="site-footer">
        <div class="container">
          <p><strong>AVANTAGE GROUP</strong> — Evaluador de Viabilidad de Tesis a Nivel de Pregrado y Posgrado en Perú.</p>
          <p style="margin-top: 0.3rem; opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem;">
            Research · Technology · Innovation · Growth
          </p>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState, clearSession } from './auth.js';
import AdminLayout from './components/AdminLayout.vue';

const route = useRoute();
const router = useRouter();

const isAdminRoute = computed(() => {
  return route.path === '/dashboard' || route.path.startsWith('/admin');
});

function handleLogout() {
  clearSession();
  router.push('/login');
}
</script>
