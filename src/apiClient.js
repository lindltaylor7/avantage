import { authState, clearSession, setSession } from './auth.js';

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

let sessionRefresh = null;

/**
 * Refresca UNA vez por carga de la app el usuario y sus permisos (y el token,
 * si el backend lo reemite porque los permisos cambiaron desde el login).
 * La espera el guard del router antes de la primera ruta protegida, para que
 * ninguna vista llame a la API con un token de permisos desactualizados.
 * Si falla (sin red, etc.) se sigue con la sesión guardada.
 */
export function refreshSessionOnce() {
  if (!authState.token) return Promise.resolve();
  sessionRefresh ??= apiFetch('/api/auth/me')
    .then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setSession(data.token || authState.token, data.user);
    })
    .catch((error) => console.warn('No se pudo refrescar el usuario/permisos:', error));
  return sessionRefresh;
}
