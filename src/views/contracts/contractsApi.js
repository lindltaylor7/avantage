import { apiFetch } from '../../apiClient.js';

/** fetch JSON con el token de sesión; lanza un Error con el mensaje del backend. */
export async function request(url, options = {}) {
  const response = await apiFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de servidor.');
  return data;
}

let clauseKey = 0;

/** Copia editable de una lista de cláusulas, con una `key` estable para el v-for. */
export function withKeys(clauses) {
  return (clauses || []).map((c) => ({ title: c.title, body: c.body, key: ++clauseKey }));
}

export function stripKeys(clauses) {
  return clauses.map(({ title, body }) => ({ title, body }));
}

export function contractNumber(contract) {
  const year = contract.created_at ? new Date(contract.created_at).getFullYear() : new Date().getFullYear();
  return `CTR-${year}-${String(contract.id).padStart(4, '0')}`;
}
