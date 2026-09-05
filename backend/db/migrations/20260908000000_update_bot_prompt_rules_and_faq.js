/**
 * Ajustes de la configuración conversacional de Avan tras revisar dos
 * conversaciones reales en las que el bot sonaba a interrogatorio y dejaba
 * peticiones sin responder:
 *
 *   1. Reglas nuevas del equipo: saludar una sola vez, no cerrar todos los
 *      mensajes con emoji, y responder de verdad a un pedido de "información"
 *      antes de seguir preguntando.
 *   2. Hechos nuevos en la base de conocimiento: qué hace Avantage. Sin ellos
 *      un "solicito información por favor" no tenía respuesta posible y el bot
 *      solo podía devolver otra pregunta.
 *   3. `tone_instructions` decía que el mínimo obligatorio era "tema y correo",
 *      cuando el correo dejó de pedirse hace tiempo y ahora el mínimo es tema,
 *      carrera y universidad. Le estaba dando al modelo un dato falso.
 *
 * Las reglas y hechos se AGREGAN (sin duplicar) en vez de reemplazar la lista
 * completa, para no pisar lo que el equipo haya editado desde el panel.
 */

const NEW_RULES = [
  'SALUDA UNA SOLA VEZ: solo el primer mensaje de la conversación lleva saludo y presentación. Del segundo mensaje en adelante NUNCA empieces con "Hola", "¡Hola!" ni "Buenas" — sigue la conversación como quien ya está hablando con la persona.',
  'EMOJIS: como máximo uno por mensaje y solo cuando aporte. No cierres todos los mensajes con emoji ni repitas el mismo dos veces seguidas: eso es lo que hace que suene a plantilla.',
  'Si te piden "información" en general o una cotización, explícales primero en una frase qué hacen en Avantage con los datos reales del servicio, y recién después haz tu pregunta pendiente. Nunca respondas a un pedido de información solo con otra pregunta.'
];

// Textos de arranque: el equipo DEBE revisarlos en el panel (Configuración de
// Avan → Datos del servicio), porque son lo que Avan afirma como cierto.
const NEW_FACTS = [
  'Avantage Group acompaña a estudiantes en Perú en el desarrollo de su tesis, con un asesor que los guía durante el proceso.',
  'Si aún no tienes un tema, no es problema: parte del acompañamiento es ayudarte a definir uno viable para tu carrera.',
  'El jefe comercial te explica en la reunión el alcance exacto del acompañamiento y las modalidades disponibles.'
];

const OLD_TONE_FRAGMENT = '(tema y correo)';
const NEW_TONE_FRAGMENT = '(tema, carrera y universidad)';

/** Parsea una columna JSON de texto a array; [] si no se puede. */
function toList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Agrega los elementos que falten, respetando lo que ya había. */
function mergeMissing(current, additions) {
  const list = toList(current);
  const missing = additions.filter((item) => !list.includes(item));
  return missing.length ? [...list, ...missing] : null;
}

export async function up(knex) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules', 'faq_knowledge', 'tone_instructions');

  for (const row of rows) {
    const patch = {};

    const rules = mergeMissing(row.prompt_rules, NEW_RULES);
    if (rules) patch.prompt_rules = JSON.stringify(rules);

    // Los hechos nuevos van al PRINCIPIO: describen qué es el servicio, así
    // que es lo primero que conviene que el modelo lea.
    const facts = toList(row.faq_knowledge);
    const missingFacts = NEW_FACTS.filter((f) => !facts.includes(f));
    if (missingFacts.length) patch.faq_knowledge = JSON.stringify([...missingFacts, ...facts]);

    if (row.tone_instructions && row.tone_instructions.includes(OLD_TONE_FRAGMENT)) {
      patch.tone_instructions = row.tone_instructions.split(OLD_TONE_FRAGMENT).join(NEW_TONE_FRAGMENT);
    }

    if (Object.keys(patch).length) {
      await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
    }
  }
}

export async function down(knex) {
  const rows = await knex('whatsapp_bot_settings').select('id', 'prompt_rules', 'faq_knowledge', 'tone_instructions');

  for (const row of rows) {
    const rules = toList(row.prompt_rules).filter((r) => !NEW_RULES.includes(r));
    const facts = toList(row.faq_knowledge).filter((f) => !NEW_FACTS.includes(f));
    const patch = {
      prompt_rules: rules.length ? JSON.stringify(rules) : null,
      faq_knowledge: facts.length ? JSON.stringify(facts) : null
    };
    if (row.tone_instructions && row.tone_instructions.includes(NEW_TONE_FRAGMENT)) {
      patch.tone_instructions = row.tone_instructions.split(NEW_TONE_FRAGMENT).join(OLD_TONE_FRAGMENT);
    }
    await knex('whatsapp_bot_settings').where({ id: row.id }).update(patch);
  }
}
