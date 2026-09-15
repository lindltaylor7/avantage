/**
 * Textos determinísticos que Avan manda por WhatsApp — el equipo comercial
 * los edita acá sin tocar la lógica del bot (`whatsappBotService.js`). Los
 * textos que redacta el LLM turno a turno (la conversación libre) no viven
 * aquí; esto es solo para los mensajes de negocio fijos donde la redacción
 * exacta importa (precio, handoffs, etc.) — se va completando fase a fase.
 */

/**
 * F1 — Primera vez que un lead pregunta por el precio: NO se da un número ni
 * un rango (decisión del equipo comercial: el precio se reserva y el foco
 * pasa a conseguir la reunión) — se explica que depende del caso y se pone
 * el peso en agendar la reunión gratuita con el asesor, que es quien lo
 * detalla.
 */
export function priceAnchor(contactName) {
  const hello = contactName ? `¡Hola, ${contactName}! ` : '';
  return (
    `${hello}El costo depende de tu carrera, tu nivel académico y el alcance de tu tesis, así que prefiero que te lo detalle el asesor con el número exacto para tu caso 🙌\n\n` +
    'Para eso es justo la reunión: es *totalmente gratis*, dura 20 min y no te compromete a nada — ahí te resuelve el precio y todas tus dudas. ¿Coordinamos?'
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
