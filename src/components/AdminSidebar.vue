<template>
  <aside class="admin-sidebar" :class="{ 'is-collapsed': isCollapsed, 'is-mobile-open': isMobileOpen }">
    <!-- Brand / Header -->
    <div class="sidebar-brand">
      <router-link to="/dashboard" class="brand-link" @click="closeMobile">
        <div class="brand-logo">AG</div>
        <div class="brand-text" v-if="!isCollapsed">
          <span class="brand-name">AVANTAGE</span>
          <span class="brand-sub">GROUP</span>
        </div>
      </router-link>

      <button class="mobile-close-btn" @click="$emit('toggle-mobile')">
        ✕
      </button>
    </div>

    <!-- Scrollable Navigation Items -->
    <div class="sidebar-scroll">
      <!-- Main Active Link (Inicio) -->
      <div class="nav-section">
        <router-link 
          to="/dashboard" 
          class="nav-item active-pill"
          :class="{ 'is-active': $route.path === '/dashboard' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Inicio</span>
        </router-link>
      </div>

      <!-- PREMIUM Section -->
      <div class="nav-section">
        <div class="section-title" v-if="!isCollapsed">PREMIUM</div>
        
        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Precios</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Archivos</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Formularios</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Ingresos</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">PostVenta</span>
        </router-link>
      </div>

      <!-- MENÚ Section -->
      <div class="nav-section">
        <div class="section-title" v-if="!isCollapsed">MENÚ</div>

        <router-link 
          v-if="hasPermission('leads.view')"
          to="/admin/database" 
          class="nav-item" 
          :class="{ 'is-active': $route.path === '/admin/database' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M21 19c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Base de Datos</span>
        </router-link>

        <router-link 
          v-if="hasPermission('leads.view')" 
          to="/admin/leads" 
          class="nav-item"
          :class="{ 'is-active': $route.path === '/admin/leads' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Funnel</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Documentos</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Comunicaciones</span>
        </router-link>

        <router-link 
          v-if="hasPermission('leads.view')" 
          to="/admin/leads" 
          class="nav-item"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <polyline points="17 11 19 13 23 9"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Mis Leads</span>
        </router-link>

        <router-link
          v-if="hasPermission('leads.view')"
          to="/admin/webhooks"
          class="nav-item"
          :class="{ 'is-active': $route.path === '/admin/webhooks' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Webhooks</span>
        </router-link>

        <router-link
          v-if="hasPermission('leads.view')"
          to="/admin/social"
          class="nav-item"
          :class="{ 'is-active': $route.path === '/admin/social' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Interacciones</span>
        </router-link>

        <router-link
          v-if="hasPermission('leads.view')"
          to="/admin/whatsapp"
          class="nav-item"
          :class="{ 'is-active': $route.path === '/admin/whatsapp' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">WhatsApp</span>
        </router-link>

        <router-link
          v-if="hasPermission('roles.manage')"
          to="/admin/roles"
          class="nav-item"
          :class="{ 'is-active': $route.path === '/admin/roles' }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Perfiles</span>
        </router-link>

        <router-link 
          v-if="hasPermission('projects.view')" 
          to="/admin/projects" 
          class="nav-item"
          :class="{ 'is-active': $route.path.startsWith('/admin/projects') }"
          @click="closeMobile"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.5-2.5h-2c-.5 0-.85-.15-1.15-.45l-1.35-1.35z"/>
            <path d="M12 15l-3-3 7.5-7.5c1.5-1.5 3.5-1.5 5 0s1.5 3.5 0 5L14 17l-2-2z"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Proyectos</span>
        </router-link>

        <router-link to="/dashboard" class="nav-item" @click="closeMobile">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="nav-label" v-if="!isCollapsed">Chat</span>
        </router-link>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { hasPermission } from '../auth.js';

const props = defineProps({
  isCollapsed: { type: Boolean, default: false },
  isMobileOpen: { type: Boolean, default: false }
});

const emit = defineEmits(['toggle-mobile']);

function closeMobile() {
  if (props.isMobileOpen) {
    emit('toggle-mobile');
  }
}
</script>

<style scoped>
.admin-sidebar {
  width: 240px;
  background-color: #121318;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  z-index: 120;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.admin-sidebar.is-collapsed {
  width: 72px;
}

.sidebar-brand {
  height: 64px;
  padding: 0 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  color: #ffffff;
}

.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 1.05rem;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(29, 107, 243, 0.35);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-name {
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  color: #ffffff;
}

.brand-sub {
  font-size: 0.65rem;
  color: #6b7280;
  letter-spacing: 0.12em;
  font-weight: 600;
}

.mobile-close-btn {
  display: none;
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 1.25rem;
  cursor: pointer;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.nav-section {
  margin-bottom: 1.25rem;
}

.section-title {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #6b7280;
  text-transform: uppercase;
  margin: 0.75rem 0 0.5rem 0.6rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.65rem 0.75rem;
  color: #9ca3af;
  text-decoration: none;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 500;
  transition: all 0.2s ease;
  margin-bottom: 0.2rem;
}

.nav-item:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.05);
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  stroke-width: 1.8;
}

/* Bright blue active pill styling matching reference image */
.nav-item.active-pill {
  background: #1d6bf3;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(29, 107, 243, 0.45);
}

.nav-item.active-pill .nav-icon {
  stroke-width: 2.2;
}

.nav-item.is-active:not(.active-pill) {
  background: rgba(29, 107, 243, 0.15);
  color: #3b82f6;
  border-left: 3px solid #3b82f6;
}

@media (max-width: 768px) {
  .admin-sidebar {
    position: fixed;
    left: -260px;
    top: 0;
    bottom: 0;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.5);
  }

  .admin-sidebar.is-mobile-open {
    left: 0;
  }

  .mobile-close-btn {
    display: block;
  }
}
</style>
