import { apiFetch } from "../../apiClient.js";

/**
 * Abre el comprobante de pago de un ingreso en una pestaña nueva, listo para
 * "Guardar como PDF".
 *
 * No se puede apuntar un <a href> directo al endpoint: la API va autenticada
 * con el token en la cabecera, así que el HTML se descarga con apiFetch y se
 * abre desde un blob. Mismo camino que usa la cotización en el Funnel.
 */
export async function openIncomeReceipt(incomeId) {
  const response = await apiFetch(`/api/finance/income/${incomeId}/receipt`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo generar el comprobante.");
  }
  const html = await response.text();
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const win = window.open(url, "_blank");
  if (!win) {
    // Ventana emergente bloqueada: se descarga el archivo.
    const link = document.createElement("a");
    link.href = url;
    link.download = `comprobante-${incomeId}.html`;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Abre el comprobante en PDF: es el mismo archivo que se adjunta al correo,
 * así que la vista previa de "Enviar comprobante" muestra exactamente lo que
 * va a recibir el cliente.
 */
export async function openIncomeReceiptPdf(incomeId) {
  const response = await apiFetch(`/api/finance/income/${incomeId}/receipt.pdf`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo generar el comprobante en PDF.");
  }
  const url = URL.createObjectURL(await response.blob());
  const win = window.open(url, "_blank");
  if (!win) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `comprobante-${incomeId}.pdf`;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
