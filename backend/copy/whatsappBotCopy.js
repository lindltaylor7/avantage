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

/**
 * Acuse para las señales críticas de `leadSignals.js` (plantón en la reunión,
 * queja, pedido explícito de hablar con una persona, o frustración con el
 * propio bot). Va ANTES del mensaje de transferencia de `handOffToAdvisor`,
 * que es genérico: este es el que reconoce lo que la persona acaba de decir.
 *
 * Cada texto se escribió con una regla en mente: reconocer el problema y
 * asumirlo, sin excusas y sin pedirle nada más a alguien que ya está molesto.
 * En particular, NUNCA se le responde con una pregunta ni se le ofrece
 * reagendar: a quien se quedó esperando en un Meet vacío, un "¿agendamos
 * otra?" se le lee como que nadie registró lo que pasó.
 */
export function criticalSignalAck(signal) {
  switch (signal) {
    case 'noShow':
      return 'Lamento muchísimo que te hayas quedado esperando, eso no debió pasar 🙏 Ya estoy avisando al equipo para que lo revisen ahora mismo.';
    case 'complaint':
      return 'Lamento que hayas tenido esta experiencia, y haces bien en escribirnos 🙏 Paso tu caso con prioridad para que lo revisen.';
    case 'humanRequest':
      return 'Claro que sí, sin problema.';
    // El bot reconociendo su propia falla: es preferible a seguir insistiendo
    // con el flujo automático, que es exactamente lo que la persona está
    // reclamando. Caso real: un lead escribió "apaga tu bot, necesito hablar
    // con alguien que sepa" después de recibir tres veces la misma evasiva.
    case 'frustration':
      return 'Tienes razón y te pido disculpas: me estoy repitiendo en vez de ayudarte 🙏 Mejor que siga una persona del equipo.';
    default:
      return 'Déjame pasarte con una persona del equipo para que te ayude mejor 🙌';
  }
}
