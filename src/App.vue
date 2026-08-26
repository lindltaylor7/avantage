<template>
  <div id="app">
    <!-- Admin Layout with Sidebar & Navbar for Dashboard / Admin pages -->
    <AdminLayout v-if="isAdminRoute">
      <router-view />
    </AdminLayout>

    <!-- Login: pantalla completa, sin el header/footer público -->
    <router-view v-else-if="isBareRoute" />

    <!-- Public Layout for the rest of the public site -->
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

          <div class="header-actions">
            <template v-if="authState.token">
              <router-link to="/dashboard" class="btn-primary header-cta">
                🧭 Dashboard Admin
              </router-link>
              <button type="button" class="btn-secondary header-cta" @click="handleLogout">
                Salir
              </button>
            </template>
            <router-link v-else to="/login" class="btn-secondary header-cta">
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
          <p class="site-footer-tagline">
            Research · Technology · Innovation · Growth
          </p>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState, clearSession, setSession } from './auth.js';
import { apiFetch } from './apiClient.js';
import AdminLayout from './components/AdminLayout.vue';

const route = useRoute();
const router = useRouter();

const isAdminRoute = computed(() => {
  return route.path === '/dashboard' || route.path.startsWith('/admin');
});

const isBareRoute = computed(() => route.path === '/login');

function handleLogout() {
  clearSession();
  router.push('/login');
}

// Los permisos quedan grabados en el usuario guardado al iniciar sesión, así
// que si un admin cambia los permisos de un rol (o se agrega un módulo
// nuevo, como Finanzas), quien ya tenía la sesión abierta no lo ve hasta
// volver a loguearse. Para no depender de eso, se refrescan en silencio al
// abrir la app — si el token ya no es válido, apiFetch se encarga de cerrar
// la sesión sola.
async function refreshPermissions() {
  if (!authState.token) return;
  try {
    const response = await apiFetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      setSession(authState.token, data.user);
    }
  } catch (error) {
    console.warn('No se pudo refrescar el usuario/permisos:', error);
  }
}

onMounted(refreshPermissions);
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.header-cta {
  text-decoration: none;
  font-size: 0.85rem;
  padding: 0.55rem 1.1rem;
  width: auto;
}

.site-footer-tagline {
  margin-top: 0.3rem;
  opacity: 0.7;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 0.72rem;
  font-family: var(--font-mono);
}
</style>
