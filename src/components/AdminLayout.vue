<template>
  <div class="admin-layout">
    <!-- Overlay for mobile drawer -->
    <div 
      v-if="isMobileOpen" 
      class="sidebar-overlay"
      @click="isMobileOpen = false"
    ></div>

    <!-- Sidebar -->
    <AdminSidebar 
      :isCollapsed="isSidebarCollapsed" 
      :isMobileOpen="isMobileOpen"
      @toggle-mobile="isMobileOpen = !isMobileOpen"
    />

    <!-- Main Content Area -->
    <div class="admin-main">
      <div class="admin-content-container">
        <!-- Top Navbar -->
        <AdminNavbar 
          @toggle-sidebar="handleToggleSidebar"
        />

        <!-- Router View Slot -->
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import AdminSidebar from './AdminSidebar.vue';
import AdminNavbar from './AdminNavbar.vue';

const isSidebarCollapsed = ref(false);
const isMobileOpen = ref(false);

function handleToggleSidebar() {
  if (window.innerWidth <= 768) {
    isMobileOpen.value = !isMobileOpen.value;
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-dark);
  color: var(--text-main);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(16, 20, 20, 0.5);
  backdrop-filter: blur(4px);
  z-index: 110;
}

.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-x: hidden;
}

.admin-content-container {
  padding: 1.25rem 1.5rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  flex: 1;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .admin-content-container {
    padding: 1rem;
  }
}
</style>
