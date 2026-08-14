import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para usuarios internos (login, gestión de cuentas).
 */
export class UserService {
  async getUserByEmail(email) {
    return db('users').where({ email }).first();
  }

  async getUserWithPermissions(userId) {
    const user = await db('users')
      .join('roles', 'roles.id', 'users.role_id')
      .where('users.id', userId)
      .select('users.id', 'users.name', 'users.email', 'users.role_id', 'roles.name as role')
      .first();

    if (!user) return null;

    const permissions = await db('permissions')
      .join('role_permissions', 'role_permissions.permission_id', 'permissions.id')
      .where('role_permissions.role_id', user.role_id)
      .pluck('permissions.key');

    return { ...user, permissions };
  }

  async listUsers() {
    return db('users')
      .join('roles', 'roles.id', 'users.role_id')
      .select('users.id', 'users.name', 'users.email', 'users.role_id', 'roles.name as role_name', 'users.created_at')
      .orderBy('users.created_at', 'desc');
  }

  /**
   * Listado ligero de usuarios internos para asignar líder/colaboradores a un
   * proyecto (no requiere permiso de gestión de roles, a diferencia de listUsers).
   */
  async listDirectory() {
    return db('users').select('id', 'name', 'email').orderBy('name', 'asc');
  }

  async createUser({ name, email, password, roleId }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const [id] = await db('users').insert({ name, email, password_hash: passwordHash, role_id: roleId });
    return this.getUserWithPermissions(id);
  }

  async updateUserRole(userId, roleId) {
    await db('users').where({ id: userId }).update({ role_id: roleId });
    return this.getUserWithPermissions(userId);
  }

  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }
}
