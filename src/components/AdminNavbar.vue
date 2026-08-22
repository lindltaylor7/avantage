<template>
  <header class="admin-navbar">
    <div class="navbar-inner">
      <!-- Left side: Collapse / Sidebar Toggle -->
      <div class="navbar-left">
        <button 
          class="icon-btn toggle-btn" 
          @click="$emit('toggle-sidebar')"
          title="Alternar Menú Sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <!-- Current Breadcrumb or Page Context -->
        <span class="page-title">{{ currentPageTitle }}</span>
      </div>

      <!-- Right side: Quick Icons & User Menu -->
      <div class="navbar-right">
        <!-- Theme Toggle Icon -->
        <button class="icon-btn" @click="toggleTheme" :title="isLightMode ? 'Modo Oscuro' : 'Modo Claro'">
          <svg v-if="!isLightMode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        <!-- Messages Icon with Red Badge -->
        <div class="badge-icon-wrapper">
          <button class="icon-btn" title="Comunicaciones y Mensajes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <span class="notification-badge red-badge">0</span>
        </div>

        <!-- Notification Bell with Red Badge -->
        <div class="badge-icon-wrapper">
          <button class="icon-btn" title="Notificaciones">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
          <span class="notification-badge red-badge">0</span>
        </div>

        <!-- User Avatar Circle with Online Dot -->
        <div class="user-menu-container" ref="userMenuRef">
          <div class="avatar-wrapper" @click="isUserMenuOpen = !isUserMenuOpen">
            <div class="avatar-circle">
              <img v-if="authState.user?.avatar" :src="authState.user.avatar" alt="Avatar" />
              <span v-else class="avatar-initials">{{ userInitials }}</span>
            </div>
            <span class="online-indicator"></span>
          </div>

          <!-- Dropdown User Menu -->
          <div v-if="isUserMenuOpen" class="user-dropdown glass-dropdown">
            <div class="dropdown-header">
              <div class="user-name">{{ authState.user?.name || 'Administrador' }}</div>
              <div class="user-email">{{ authState.user?.email || 'admin@avantage.pe' }}</div>
              <div class="user-role-badge">{{ authState.user?.role || 'Admin' }}</div>
            </div>

            <div class="dropdown-divider"></div>

            <router-link to="/" class="dropdown-item" @click="isUserMenuOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              Sitio Público
            </router-link>

            <router-link to="/dashboard" class="dropdown-item" @click="isUserMenuOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Inicio Dashboard
            </router-link>

            <div class="dropdown-divider"></div>

            <button type="button" class="dropdown-item logout-item" @click="handleLogout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState, clearSession } from '../auth.js';

const emit = defineEmits(['toggle-sidebar']);
const route = useRoute();
const router = useRouter();

const isLightMode = ref(false);
const isUserMenuOpen = ref(false);
const userMenuRef = ref(null);

const currentPageTitle = computed(() => {
  if (route.path === '/dashboard') return 'Inicio';
  if (route.path === '/admin/database') return 'Base de Datos de Leads';
  if (route.path === '/admin/leads') return 'Funnel de Leads';
  if (route.path === '/admin/setter-funnel') return 'Setter Funnel';
  if (route.path === '/admin/instagram') return 'Interacciones de Instagram';
  if (route.path === '/admin/social') return 'Interacciones de Facebook';
  if (route.path.startsWith('/admin/projects')) return 'Gestión de Proyectos';
  if (route.path === '/admin/roles') return 'Roles y Permisos';
  return 'Dashboard';
});

const userInitials = computed(() => {
  const name = authState.user?.name || 'Admin';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
});

function toggleTheme() {
  isLightMode.value = !isLightMode.value;
}

function handleLogout() {
  isUserMenuOpen.value = false;
  clearSession();
  router.push('/login');
}

function handleClickOutside(event) {
  if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
    isUserMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.admin-navbar {
  margin-bottom: 1.5rem;
}

.navbar-inner {
  background-color: #171821;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  height: 56px;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.07);
}

.icon-btn svg {
  width: 20px;
  height: 20px;
}

.page-title {
  font-family: var(--font-heading);
  font-size: 0.95rem;
  font-weight: 600;
  color: #e5e7eb;
  letter-spacing: 0.02em;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge-icon-wrapper {
  position: relative;
}

.notification-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  border-radius: 9999px;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.red-badge {
  background-color: #ef4444;
  color: #ffffff;
  border: 1px solid #171821;
}

.user-menu-container {
  position: relative;
  margin-left: 0.25rem;
}

.avatar-wrapper {
  position: relative;
  cursor: pointer;
}

.avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.85rem;
  border: 2px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transition: transform 0.2s ease;
}

.avatar-wrapper:hover .avatar-circle {
  transform: scale(1.05);
}

.avatar-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  background-color: #10b981;
  border: 2px solid #171821;
  border-radius: 50%;
}

.user-dropdown {
  position: absolute;
  top: 48px;
  right: 0;
  width: 230px;
  background-color: #1a1b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  padding: 0.75rem;
  z-index: 150;
}

.dropdown-header {
  padding-bottom: 0.5rem;
}

.user-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: #ffffff;
}

.user-email {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.35rem;
  word-break: break-all;
}

.user-role-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.dropdown-divider {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.08);
  margin: 0.5rem 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  color: #d1d5db;
  text-decoration: none;
  font-size: 0.825rem;
  transition: all 0.2s ease;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.dropdown-item:hover {
  background-color: rgba(255, 255, 255, 0.07);
  color: #ffffff;
}

.logout-item {
  color: #f87171;
}

.logout-item:hover {
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
</style>
