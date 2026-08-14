import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para roles y permisos (herramientas internas
 * existentes o por desarrollarse, habilitables por rol).
 */
export class RoleService {
  async listRoles() {
    const roles = await db('roles').select('*').orderBy('id', 'asc');
    const rolePermissions = await db('role_permissions')
      .join('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select('role_permissions.role_id', 'permissions.id', 'permissions.key', 'permissions.label');

    return roles.map(role => ({
      ...role,
      permissions: rolePermissions
        .filter(rp => rp.role_id === role.id)
        .map(rp => ({ id: rp.id, key: rp.key, label: rp.label }))
    }));
  }

  async getRoleById(id) {
    const roles = await this.listRoles();
    return roles.find(r => r.id === Number(id));
  }

  async createRole({ name, description }) {
    const [id] = await db('roles').insert({ name, description: description || null });
    return this.getRoleById(id);
  }

  async setRolePermissions(roleId, permissionIds) {
    await db('role_permissions').where({ role_id: roleId }).del();
    if (permissionIds.length > 0) {
      await db('role_permissions').insert(permissionIds.map(pid => ({ role_id: roleId, permission_id: pid })));
    }
    return this.getRoleById(roleId);
  }

  async listPermissions() {
    return db('permissions').select('*').orderBy('id', 'asc');
  }

  async createPermission({ key, label }) {
    const [id] = await db('permissions').insert({ key, label });
    return db('permissions').where({ id }).first();
  }
}
