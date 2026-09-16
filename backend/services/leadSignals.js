/**
 * Señales críticas en el mensaje de un lead que NUNCA deben depender de que
 * el LLM las interprete bien.
 *
 * El motor conversacional (`ollamaService.converseAsAvan`) está afinado para
 * una cosa: entender el caso de tesis y llevar a la reunión. Eso hace que un
 * mensaje que se sale de ese guion —"nadie entró al Meet", "quiero hablar con
 * una persona", "ya te dije mi carrera"— compita con el objetivo del prompt, y
 * el modelo tiende a contestarlo con la siguiente pregunta de su agenda en vez
 * de atender lo que la persona realmente dijo. Son justo los mensajes donde
 * equivocarse cuesta más caro: un lead que ya está molesto y recibe otra
 * pregunta del bot no vuelve.
 *
 * Por eso se detectan acá, con reglas determinísticas, ANTES de gastar un
 * turno del LLM: sea cual sea lo que el modelo hubiera contestado, estos
 * mensajes se responden con un texto fijo y se pasan a una persona.
 *
 * El orden de prioridad importa: un mensaje puede disparar varias señales a la
 * vez ("estuve esperando y nadie entró, quiero hablar con alguien") y lo que
 * corresponde responder es lo más específico y lo que más pesa — la disculpa
 * por el plantón, no el acuse de "te paso con un asesor".
 */

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El asesor no apareció a una reunión ya agendada. Es la señal más urgente de
 * todas: la persona hizo el esfuerzo de agendar Y de conectarse, y el plantón
 * es nuestro. Responderle con cualquier otra cosa (y sobre todo con un
 * "¿agendamos otra?") se lee como que a nadie le importó.
 */
const NO_SHOW_RE = /nadie\s+(entro|se\s+conecto|aparecio|llego|vino|me\s+atendio|me\s+respondio)|no\s+(entro|entraron|aparecio|llego|llegaron|se\s+conecto)\s+nadie|estuve\s+esperando|quede\s+esperando|me\s+dejaron\s+(plantad|esperando|colgad)|sala\s+(?:estaba\s+|esta\s+)?vacia|no\s+habia\s+nadie|el\s+asesor\s+no\s+(entro|llego|se\s+conecto|aparecio|me\s+atendio)|no\s+me\s+(atendieron|contestaron|respondieron)/;

/**
 * Queja explícita sobre el servicio o la empresa.
 *
 * OJO con lo que NO está acá a propósito: "no sirve" / "no me sirve" se ve
 * como queja pero en esta conversación es, casi siempre, una respuesta normal
 * del agendamiento ("ese horario no me sirve"). Escalarla a un asesor sería
 * abandonar a alguien que solo estaba pidiendo otra hora.
 */
const COMPLAINT_RE = /\b(?:queja|reclamo|pesim[oa]|estafa\w*|fraude|timo)\b|mal\s+servicio|muy\s+mal\s+(?:servicio|trabajo|atencion)|(?:quiero|exijo)\s+(?:mi\s+)?(?:devolucion|reembolso)|me\s+devuelven\s+(?:mi\s+)?(?:dinero|plata)|estoy\s+(?:muy\s+)?(?:molest|indignad|furios|enojad)/;

/**
 * Pide explícitamente hablar con una persona. Se honra siempre y de
 * inmediato: discutirlo, o "resolverlo" con una pregunta más del bot, es la
 * forma más rápida de perder a alguien que ya dijo lo que quiere.
 *
 * "Asesor" NO cuenta como pedido de persona por sí solo: es vocabulario
 * normal del propio bot ("te paso con un asesor", "la reunión es con un
 * asesor"), así que una pregunta como "¿la reunión es para hablar con un
 * asesor?" escalaría sin que nadie lo haya pedido. Solo cuenta cuando viene
 * con un verbo de deseo explícito ("quiero hablar con un asesor") o en
 * imperativo ("pásame con un asesor").
 */
const HUMAN_REQUEST_RE = /hablar\s+con\s+(?:alguien|una\s+persona|un\s+humano|una\s+humana|un\s+encargado|un\s+representante)|pasa(?:me|rme)?\s+con\s+(?:alguien|un\s+asesor|una\s+persona|un\s+humano)|quiero\s+(?:hablar|conversar|comunicarme)\s+con\s+(?:alguien|una\s+persona|un\s+humano|un\s+asesor)|atencion\s+(?:humana|de\s+una\s+persona)|(?:una\s+)?persona\s+real|no\s+(?:quiero|deseo)\s+(?:hablar\s+con\s+)?(?:un\s+|una\s+)?(?:bot|robot|maquina|inteligencia\s+artificial)|apagar?\s+(?:tu|el)\s+bot/;

/**
 * El lead se queja de que el BOT no lo entiende o le repite las preguntas.
 * Es la señal de que la conversación ya se rompió: seguir insistiendo con el
 * flujo automático solo confirma lo que la persona está reclamando. Caso real
 * en producción: un lead escribió "apaga tu bot, necesito hablar con alguien
 * que sepa" después de que el bot le repitiera la misma evasiva tres veces.
 */
const FRUSTRATION_RE = /ya\s+te\s+(dije|conte|respondi|explique|habia\s+dicho)|ya\s+lo\s+(dije|conte|respondi)|no\s+me\s+(entiendes|estas\s+entendiendo|escuchas|estas\s+escuchando|lees|estas\s+leyendo)|te\s+estoy\s+diciendo\s+que|otra\s+vez\s+(lo\s+mismo|la\s+misma)|siempre\s+(dices|repites|preguntas)\s+lo\s+mismo|no\s+entiendes\s+nada|me\s+(preguntas|estas\s+preguntando)\s+lo\s+mismo|ya\s+te\s+respondi\s+eso/;

const SIGNAL_TESTS = [
  ['noShow', NO_SHOW_RE],
  ['complaint', COMPLAINT_RE],
  ['humanRequest', HUMAN_REQUEST_RE],
  ['frustration', FRUSTRATION_RE]
];

/**
 * Todas las señales presentes en el texto, como objeto de banderas. Útil para
 * la bitácora del panel (deja ver por qué se escaló una conversación).
 */
export function detectLeadSignals(text) {
  const clean = normalize(text);
  const signals = {};
  for (const [name, re] of SIGNAL_TESTS) signals[name] = re.test(clean);
  return signals;
}

/**
 * La señal de MAYOR prioridad presente en el texto, o null si no hay ninguna.
 * El orden de `SIGNAL_TESTS` es el orden de prioridad — ver la nota de arriba
 * sobre mensajes que disparan varias a la vez.
 */
export function criticalSignal(text) {
  const clean = normalize(text);
  for (const [name, re] of SIGNAL_TESTS) {
    if (re.test(clean)) return name;
  }
  return null;
}
