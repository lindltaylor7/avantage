import { authState, clearSession } from './auth.js';

/**
 * Wrapper de fetch que adjunta el token Bearer a las llamadas de API internas
 * (Panel de Leads, Proyectos, Roles y Permisos) y cierra la sesión si el
 * backend responde 401 (token inválido o expirado).
 */
export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authState.token) {
    headers['Authorization'] = `Bearer ${authState.token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearSession();
    window.location.href = '/login';
  }

  return response;
}
