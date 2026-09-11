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
  // Si el body es un string (JSON serializado) y no se especificó Content-Type,
  // asumir application/json — sin esta cabecera express.json() no parsea el body
  // y el backend recibe req.body vacío.
  if (typeof options.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearSession();
    window.location.href = '/login';
  }

  return response;
}
