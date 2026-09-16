import { apiFetch } from '../../apiClient.js';

/**
 * Los comprobantes viven detrás del permiso `finance.view` y `apiFetch` adjunta
 * el token Bearer, así que no se pueden usar directamente en `<img src>`. Se
 * descargan como blob y se devuelve un object URL para mostrarlos.
 *
 * Quien lo llame es responsable de liberar el URL con `URL.revokeObjectURL`
 * cuando ya no lo necesite (p. ej. en `onBeforeUnmount`).
 */
export async function loadReceiptUrl(apiPath) {
  const response = await apiFetch(apiPath);
  if (!response.ok) throw new Error('No se pudo cargar el comprobante.');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Los comprobantes admiten imágenes y PDFs: un PDF no se puede pintar en un
 * `<img>`, así que la tabla muestra un icono de documento en su lugar.
 */
export function isPdfReceipt(mimeType, fileName) {
  return (mimeType || '').includes('pdf') || /\.pdf$/i.test(fileName || '');
}
