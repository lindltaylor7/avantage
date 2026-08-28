import { apiFetch } from './apiClient.js';

/**
 * Descarga una imagen de un endpoint protegido de la API (que requiere el
 * token Bearer, así que no puede ir directo en `<img src>`) y devuelve un
 * object URL para mostrarla. Devuelve `null` si la imagen no está disponible.
 *
 * Quien lo llame debe liberar el URL con `URL.revokeObjectURL` cuando ya no
 * lo necesite (p. ej. en `onBeforeUnmount`).
 */
export async function loadApiImage(apiPath) {
  try {
    const response = await apiFetch(apiPath);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
