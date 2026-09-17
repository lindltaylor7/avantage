import { reactive } from 'vue';

// Claves de localStorage propias del portal, separadas de las del panel
// interno (auth.js): así una sesión de cliente y una de staff conviven en el
// mismo navegador sin pisarse.
const storedClient = localStorage.getItem('portal_auth_client');

export const clientAuthState = reactive({
  token: localStorage.getItem('portal_auth_token') || null,
  client: storedClient ? JSON.parse(storedClient) : null
});

export function setClientSession(token, client) {
  clientAuthState.token = token;
  clientAuthState.client = client;
  localStorage.setItem('portal_auth_token', token);
  localStorage.setItem('portal_auth_client', JSON.stringify(client));
}

export function clearClientSession() {
  clientAuthState.token = null;
  clientAuthState.client = null;
  localStorage.removeItem('portal_auth_token');
  localStorage.removeItem('portal_auth_client');
}

export function isClientAuthenticated() {
  return !!clientAuthState.token;
}
