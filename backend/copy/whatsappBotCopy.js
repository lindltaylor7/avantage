/**
 * Textos determinísticos que Avan manda por WhatsApp — el equipo comercial
 * los edita acá sin tocar la lógica del bot (`whatsappBotService.js`). Los
 * textos que redacta el LLM turno a turno (la conversación libre) no viven
 * aquí; esto es solo para los mensajes de negocio fijos donde la redacción
 * exacta importa (precio, handoffs, etc.) — se va completando fase a fase.
 */

function formatSoles(amount) {
  return `S/${Number(amount).toLocaleString('en-US')}`;
}

function formatRange(min, max) {
  return `${formatSoles(min)} - ${formatSoles(max)}`;
}

/**
 * F1 — Primera vez que un lead pregunta por el precio: rango real por nivel
 * académico + aclara que la reunión con el asesor es gratis. Los montos
 * salen de `whatsapp_bot_settings` (editables desde el panel), nunca los
 * redacta el LLM.
 */
export function priceAnchor(settings, contactName) {
  const hello = contactName ? `¡Hola, ${contactName}! ` : '';
  return (
    `${hello}Te paso rangos reales para que tengas una idea 🙌\n\n` +
    `• Pregrado (bachiller/título): ${formatRange(settings.price_pregrado_min, settings.price_pregrado_max)}\n` +
    `• Maestría: ${formatRange(settings.price_maestria_min, settings.price_maestria_max)}\n` +
    `• Doctorado: ${formatRange(settings.price_doctorado_min, settings.price_doctorado_max)}\n\n` +
    'El costo final depende de tu carrera, tu nivel y el alcance de tu tesis — eso te lo detalla el asesor. ' +
    'Y esa reunión es *totalmente gratis*, dura 20 min y no te compromete a nada.'
  );
}

/** F1 — Segunda vez que insiste con el precio: texto distinto al de la 1ª + handoff. */
export function priceInsistedHandoff() {
  return 'Entiendo que quieres el número exacto ya 🙌 Te paso directo con el asesor para que te lo confirme y resuelva tus dudas al detalle.';
}

/**
 * F1 — Insiste con el precio durante el agendamiento (después de haber
 * recibido ya el ancla de precio en la conversación libre): texto distinto
 * a los dos de arriba, para que nunca se repita la misma evasiva dos veces
 * en una misma conversación.
 */
export function priceInsistedDuringScheduling() {
  return 'El precio y las formas de pago te los explica el asesor con calma. Te lo paso ahora para que lo coordinen directamente 🙌';
}
