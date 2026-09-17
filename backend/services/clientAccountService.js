import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';

const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function futureDate(ms) {
  return new Date(Date.now() + ms);
}

/**
 * Cuentas del portal de clientes (login separado del panel interno). La
 * identidad es el correo — el mismo `projects.client_email` que ya usa el
 * resto del sistema — y la cuenta nace sin contraseña hasta que el cliente
 * la activa con el token que le llega por correo.
 */
export class ClientAccountService {
  async getByEmail(email) {
    if (!email) return null;
    return db('client_accounts').where({ email: email.trim().toLowerCase() }).first();
  }

  async getById(id) {
    return db('client_accounts').where({ id }).first();
  }

  /**
   * Todas las cuentas del portal, para el panel de administración
   * (`/admin/roles`), con la cantidad de proyectos asociados a cada correo.
   */
  async listAll() {
    const accounts = await db('client_accounts').orderBy('created_at', 'desc');
    if (accounts.length === 0) return [];

    const counts = await db('projects')
      .whereIn('client_email', accounts.map((a) => a.email))
      .select('client_email')
      .count({ count: '*' })
      .groupBy('client_email');
    const countByEmail = new Map(counts.map((c) => [c.client_email, Number(c.count)]));

    return accounts.map((account) => ({
      ...account,
      project_count: countByEmail.get(account.email) || 0
    }));
  }

  /** Revoca el acceso al portal (el equipo lo vuelve a invitar si hace falta). */
  async deleteAccount(id) {
    return db('client_accounts').where({ id }).del();
  }

  /**
   * Crea la cuenta si no existe (idempotente por correo). Si ya existe —
   * cliente recurrente con otro proyecto nuevo— no la toca ni reenvía token
   * solo por esto; el caller decide si reenviar la invitación manualmente.
   */
  async ensureAccountForEmail(email, name) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) throw new Error('El correo del cliente es requerido.');

    const existing = await this.getByEmail(normalizedEmail);
    if (existing) return { account: existing, isNew: false };

    const activationToken = newToken();
    const [id] = await db('client_accounts').insert({
      email: normalizedEmail,
      name: name?.trim() || null,
      activation_token: activationToken,
      activation_token_expires_at: futureDate(ACTIVATION_TOKEN_TTL_MS)
    });
    const account = await db('client_accounts').where({ id }).first();
    return { account, isNew: true };
  }

  /** Vuelve a generar el token de activación (p. ej. si el primer correo se perdió). */
  async regenerateInvite(email) {
    const account = await this.getByEmail(email);
    if (!account) return null;

    const activationToken = newToken();
    await db('client_accounts').where({ id: account.id }).update({
      activation_token: activationToken,
      activation_token_expires_at: futureDate(ACTIVATION_TOKEN_TTL_MS)
    });
    return db('client_accounts').where({ id: account.id }).first();
  }

  async activate(token, password) {
    if (!token) throw new Error('Falta el token de activación.');
    if (!password || password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres.');
    }

    const account = await db('client_accounts').where({ activation_token: token }).first();
    if (!account) throw new Error('El link de activación no es válido.');
    if (!account.activation_token_expires_at || new Date(account.activation_token_expires_at) < new Date()) {
      throw new Error('El link de activación expiró. Pide que te reenvíen la invitación.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db('client_accounts').where({ id: account.id }).update({
      password_hash: passwordHash,
      activation_token: null,
      activation_token_expires_at: null,
      last_login_at: db.fn.now()
    });
    return db('client_accounts').where({ id: account.id }).first();
  }

  async authenticate(email, password) {
    const account = await this.getByEmail(email);
    if (!account) return null;
    if (!account.password_hash) {
      const err = new Error('Todavía no activaste tu cuenta. Revisa el correo de invitación.');
      err.code = 'NOT_ACTIVATED';
      throw err;
    }

    const matches = await bcrypt.compare(password, account.password_hash);
    if (!matches) return null;

    await db('client_accounts').where({ id: account.id }).update({ last_login_at: db.fn.now() });
    return account;
  }

  /** Devuelve el token generado (para que el caller mande el correo) o null si el correo no existe. */
  async requestPasswordReset(email) {
    const account = await this.getByEmail(email);
    if (!account) return null;

    const resetToken = newToken();
    await db('client_accounts').where({ id: account.id }).update({
      reset_token: resetToken,
      reset_token_expires_at: futureDate(RESET_TOKEN_TTL_MS)
    });
    return { account, resetToken };
  }

  async resetPassword(token, password) {
    if (!token) throw new Error('Falta el token de restablecimiento.');
    if (!password || password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres.');
    }

    const account = await db('client_accounts').where({ reset_token: token }).first();
    if (!account) throw new Error('El link de restablecimiento no es válido.');
    if (!account.reset_token_expires_at || new Date(account.reset_token_expires_at) < new Date()) {
      throw new Error('El link de restablecimiento expiró. Pídelo de nuevo.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db('client_accounts').where({ id: account.id }).update({
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires_at: null
    });
    return db('client_accounts').where({ id: account.id }).first();
  }
}
