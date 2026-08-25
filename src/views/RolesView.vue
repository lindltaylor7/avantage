<template>
  <main class="container" style="flex: 1; padding-top: 2rem; padding-bottom: 4rem;">
    <div style="margin-bottom: 1.5rem;">
      <h2 class="section-heading"><span>🔐</span> Roles y Permisos</h2>
      <p class="section-subheading" style="margin-bottom: 0;">
        Define las herramientas internas (existentes o por desarrollarse) y asígnalas por rol a cada usuario.
      </p>
    </div>

    <div v-if="loadError" class="info-box" style="border-color: rgba(178, 58, 69, 0.4); margin-bottom: 1.5rem;">
      <h4 style="color: var(--accent-rose);">⚠️ No se pudo cargar la información</h4>
      <p>{{ loadError }}</p>
    </div>

    <!-- Herramientas (Permisos) -->
    <section style="margin-bottom: 2.5rem;">
      <h3 style="font-size: 1rem; color: var(--accent-cyan); margin-bottom: 0.75rem;">🧩 Herramientas Registradas</h3>
      <div class="glass-panel" style="padding: 1.5rem;">
        <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.25rem;">
          <span v-for="p in permissions" :key="p.id" class="tool-chip">{{ p.label }} <code>{{ p.key }}</code></span>
        </div>
        <form style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: flex-end;" @submit.prevent="createPermission">
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 160px;">
            <label class="form-label">Clave (key)</label>
            <input v-model="newPermission.key" type="text" class="form-input" placeholder="ej: reports.view" required />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 2; min-width: 220px;">
            <label class="form-label">Nombre de la herramienta</label>
            <input v-model="newPermission.label" type="text" class="form-input" placeholder="ej: Reportes Avanzados (por desarrollar)" required />
          </div>
          <button type="submit" class="btn-primary" style="width: auto; padding: 0 1.25rem;">Registrar Herramienta</button>
        </form>
      </div>
    </section>

    <!-- Roles -->
    <section style="margin-bottom: 2.5rem;">
      <h3 style="font-size: 1rem; color: var(--accent-cyan); margin-bottom: 0.75rem;">🏷️ Roles</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
        <div v-for="role in roles" :key="role.id" class="glass-panel" style="padding: 1.25rem;">
          <h4 style="color: var(--text-main); font-size: 0.95rem; margin-bottom: 0.25rem;">{{ role.name }}</h4>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.85rem;">{{ role.description || 'Sin descripción' }}</p>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            <label v-for="p in permissions" :key="p.id" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text-sub); cursor: pointer;">
              <input
                type="checkbox"
                :checked="roleHasPermission(role, p.id)"
                @change="togglePermission(role, p, $event.target.checked)"
              />
              {{ p.label }}
            </label>
          </div>
        </div>
      </div>

      <div class="glass-panel" style="padding: 1.5rem;">
        <h4 style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.75rem;">➕ Crear Nuevo Rol</h4>
        <form style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: flex-end;" @submit.prevent="createRole">
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 160px;">
            <label class="form-label">Nombre</label>
            <input v-model="newRole.name" type="text" class="form-input" placeholder="ej: Soporte" required />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 2; min-width: 220px;">
            <label class="form-label">Descripción (opcional)</label>
            <input v-model="newRole.description" type="text" class="form-input" placeholder="ej: Atención de consultas de clientes" />
          </div>
          <button type="submit" class="btn-primary" style="width: auto; padding: 0 1.25rem;">Crear Rol</button>
        </form>
      </div>
    </section>

    <!-- Usuarios -->
    <section>
      <h3 style="font-size: 1rem; color: var(--accent-cyan); margin-bottom: 0.75rem;">👥 Usuarios Internos</h3>
      <div class="glass-panel" style="padding: 1.5rem; overflow-x: auto; margin-bottom: 1.25rem;">
        <table v-if="users.length > 0" class="users-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.name }}</td>
              <td>{{ user.email }}</td>
              <td>
                <select
                  :value="user.role_id"
                  class="form-select"
                  style="width: auto; padding: 0.35rem 0.6rem; font-size: 0.8rem;"
                  @change="changeUserRole(user, $event.target.value)"
                >
                  <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
                </select>
              </td>
              <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.8rem;">{{ formatDate(user.created_at) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No hay usuarios registrados.</div>
      </div>

      <div class="glass-panel" style="padding: 1.5rem;">
        <h4 style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.75rem;">➕ Crear Nuevo Usuario</h4>
        <form style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: flex-end;" @submit.prevent="createUser">
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 160px;">
            <label class="form-label">Nombre</label>
            <input v-model="newUser.name" type="text" class="form-input" required />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 200px;">
            <label class="form-label">Correo</label>
            <input v-model="newUser.email" type="email" class="form-input" required />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 160px;">
            <label class="form-label">Contraseña</label>
            <input v-model="newUser.password" type="password" class="form-input" minlength="6" required />
          </div>
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 160px;">
            <label class="form-label">Rol</label>
            <select v-model="newUser.roleId" class="form-select" required>
              <option value="" disabled>Selecciona un rol</option>
              <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
            </select>
          </div>
          <button type="submit" class="btn-primary" style="width: auto; padding: 0 1.25rem;">Crear Usuario</button>
        </form>
        <div v-if="userError" style="margin-top: 0.75rem; color: var(--accent-rose); font-size: 0.82rem;">{{ userError }}</div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

const roles = ref([]);
const permissions = ref([]);
const users = ref([]);
const loadError = ref('');
const userError = ref('');

const newPermission = reactive({ key: '', label: '' });
const newRole = reactive({ name: '', description: '' });
const newUser = reactive({ name: '', email: '', password: '', roleId: '' });

async function fetchRoles() {
  const response = await apiFetch('/api/roles');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener los roles.');
  roles.value = data.roles || [];
}

async function fetchPermissions() {
  const response = await apiFetch('/api/permissions');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener las herramientas.');
  permissions.value = data.permissions || [];
}

async function fetchUsers() {
  const response = await apiFetch('/api/users');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener los usuarios.');
  users.value = data.users || [];
}

async function fetchAll() {
  loadError.value = '';
  try {
    await Promise.all([fetchRoles(), fetchPermissions(), fetchUsers()]);
  } catch (err) {
    loadError.value = err.message;
  }
}

function roleHasPermission(role, permissionId) {
  return role.permissions.some(p => p.id === permissionId);
}

async function togglePermission(role, permission, checked) {
  const currentIds = role.permissions.map(p => p.id);
  const nextIds = checked ? [...currentIds, permission.id] : currentIds.filter(id => id !== permission.id);

  try {
    const response = await apiFetch(`/api/roles/${role.id}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionIds: nextIds })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar los permisos.');
    role.permissions = data.role.permissions;
  } catch (err) {
    alert('No se pudo actualizar el permiso: ' + err.message);
  }
}

async function createPermission() {
  try {
    const response = await apiFetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newPermission.key.trim(), label: newPermission.label.trim() })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al registrar la herramienta.');
    permissions.value.push(data.permission);
    newPermission.key = '';
    newPermission.label = '';
  } catch (err) {
    alert('No se pudo registrar la herramienta: ' + err.message);
  }
}

async function createRole() {
  try {
    const response = await apiFetch('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRole.name.trim(), description: newRole.description.trim() })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear el rol.');
    roles.value.push(data.role);
    newRole.name = '';
    newRole.description = '';
  } catch (err) {
    alert('No se pudo crear el rol: ' + err.message);
  }
}

async function createUser() {
  userError.value = '';
  try {
    const response = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al crear el usuario.');
    await fetchUsers();
    newUser.name = '';
    newUser.email = '';
    newUser.password = '';
    newUser.roleId = '';
  } catch (err) {
    userError.value = err.message;
  }
}

async function changeUserRole(user, roleId) {
  const previousRoleId = user.role_id;
  user.role_id = Number(roleId);
  try {
    const response = await apiFetch(`/api/users/${user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar el rol del usuario.');
  } catch (err) {
    user.role_id = previousRoleId;
    alert('No se pudo actualizar el rol: ' + err.message);
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

onMounted(() => {
  fetchAll();
});
</script>

<style scoped>
.tool-chip {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.78rem;
  color: var(--text-sub);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tool-chip code {
  font-size: 0.7rem;
  color: var(--accent-cyan);
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.users-table th {
  text-align: left;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.users-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-sub);
}
</style>
