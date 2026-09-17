import { clientAuthState, clearClientSession } from './clientAuth.js';

/**
 * Wrapper de fetch para el portal de clientes: adjunta el token del cliente
 * (no el de staff) y, si el backend responde 401, cierra solo la sesión del
 * portal y manda a /portal/login (nunca a /login).
 */
export async function clientApiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (clientAuthState.token) {
    headers['Authorization'] = `Bearer ${clientAuthState.token}`;
  }
  if (typeof options.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearClientSession();
    window.location.href = '/portal/login';
  }

  return response;
}
