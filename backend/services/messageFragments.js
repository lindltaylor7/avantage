/**
 * Normalización del mensaje que sale del buffer de silencio.
 *
 * En WhatsApp la gente no escribe una frase completa y la manda: escribe a
 * pedazos, y le da a enviar en cada pausa. El buffer ya junta esas burbujas en
 * un solo turno (ver `bufferMessage`), pero juntarlas con un salto de línea no
 * las convierte en una frase: quedan como renglones sueltos, y un renglón
 * suelto pierde el sentido que solo tenía pegado al anterior.
 *
 * El caso que más caro sale es el meridiano. "Me desocupo a las 9" + "pm"
 * llegan como dos burbujas; leído por separado, el "9" se interpreta como las
 * 9 de la MAÑANA y se le agenda una reunión doce horas antes de lo que pidió
 * —justo en el horario en el que dijo que estaba trabajando—. Es un error que
 * el lead no perdona, porque él sí escribió "pm".
 *
 * Por eso esto corre sobre el texto ya unido y ANTES de que lo vea nadie más
 * (ni el LLM, ni el parser de fechas, ni las expresiones del agendamiento):
 * una sola normalización, y todo lo que viene después lee una frase coherente.
 */

/** Un renglón que es SOLO un meridiano: "pm", "PM", "p.m.", "a m". */
const MERIDIEM_ONLY_LINE_RE = /^\s*[ap]\.?\s?m\.?\s*$/i;

/** ¿El renglón anterior termina en algo que puede ser una hora? ("9", "9:30") */
const ENDS_WITH_CLOCK_RE = /\d(?::\d{2})?\s*$/;

/**
 * Pega a la hora del renglón anterior un meridiano que vino solo en el suyo.
 *
 * Deliberadamente conservador: solo actúa cuando el renglón es ÚNICAMENTE el
 * meridiano y el anterior termina en un número que puede ser una hora. Un
 * "pm" suelto después de "hola" no se toca — inventar ahí una hora que nadie
 * escribió sería peor que no entender nada.
 */
export function coalesceTimeFragments(text) {
  const lines = String(text || '').split('\n');
  const merged = [];

  for (const line of lines) {
    const previous = merged[merged.length - 1];
    if (MERIDIEM_ONLY_LINE_RE.test(line) && previous !== undefined && ENDS_WITH_CLOCK_RE.test(previous)) {
      merged[merged.length - 1] = `${previous.trimEnd()} ${line.trim()}`;
      continue;
    }
    merged.push(line);
  }

  return merged.join('\n');
}
