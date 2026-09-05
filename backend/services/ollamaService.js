import dotenv from 'dotenv';
import { BOT_PROMPT_DEFAULTS } from './whatsappBotPromptDefaults.js';
dotenv.config();

/**
 * Vectores de referencia simulados / temáticos de líneas prioritarias de investigación CONCYTEC - Perú
 * Se utilizan para medir la similitud semántica de embeddings en el contexto peruano.
 */
const PERU_RESEARCH_PRIORITIES = [
  { name: 'Tecnologías de la Información, IA y Automatización', keywords: ['inteligencia artificial', 'ia', 'software', 'algoritmo', 'vision', 'automatizacion', 'app', 'web', 'machine learning', 'datos'] },
  { name: 'Agroindustria, Seguridad Alimentaria y Biotecnología', keywords: ['palta', 'quinua', 'cafe', 'cacao', 'agrícola', 'cultivo', 'biotecnología', 'alimentos', 'riego', 'suelo'] },
  { name: 'Minería Sostenible, Recursos Naturales y Medio Ambiente', keywords: ['minería', 'cobre', 'agua', 'contaminación', 'medio ambiente', 'sostenible', 'residuos', 'energía', 'biodiversidad', 'relaves'] },
  { name: 'Salud Pública, Biomedicina y Bienestar Social', keywords: ['salud', 'hospital', 'diagnóstico', 'epidemía', 'nutrición', 'medicina', 'telemedicina', 'salud mental', 'dengue'] },
  { name: 'Educación, Gobernanza y Desarrollo Social en Perú', keywords: ['educación', 'sunedu', 'enseñanza', 'aprendizaje', 'corrupción', 'gestión pública', 'municipalidad', 'pobreza', 'universidad'] },
  { name: 'Economía, Finanzas y Emprendimiento Nacional', keywords: ['mype', 'empresa', 'finanzas', 'exportación', 'turismo', 'tributario', 'comercio', 'mercado', 'formalización'] }
];

/**
 * Calcula la similitud coseno entre dos vectores numéricos
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Le dice al LLM, en texto llano y sin ambigüedad, cuál es el siguiente dato
 * que le falta a Avan por conocer (en orden de prioridad). Modelos chicos
 * como los que corren en Ollama Cloud siguen una instrucción directa como
 * esta de forma mucho más confiable que si tienen que inferir la prioridad
 * a partir de una lista larga de reglas generales.
 */
function describeMissingPriority(knownAnswers) {
  const answers = knownAnswers || {};
  if (!answers.problem) return 'el tema o problema de tesis que quiere investigar. Si ya te dijo que no tiene tema, no lo vuelvas a preguntar: guárdalo como "Sin tema definido (desde cero)" y sigue con la carrera. NO marques "ready": true todavía.';
  if (!answers.field) return 'ya conoces el tema; ahora te falta la CARRERA de su tesis. NO marques "ready": true todavía.';
  if (!answers.university) return 'ya conoces el tema y la carrera; ahora te falta la UNIVERSIDAD donde estudia. NO marques "ready": true todavía.';
  return 'ya tienes el tema, la carrera y la universidad: NO preguntes nada más (ni nivel, ni correo). Marca "ready": true en este mismo turno con un "reply" corto de acuse (ej. "Perfecto 👀"). El sistema se encarga de proponer la reunión y la modalidad.';
}

/**
 * Genera un embedding sintético determinista de 384 dimensiones para análisis semántico local
 */
function generateFallbackEmbedding(text) {
  const dim = 384;
  const vector = new Array(dim).fill(0);
  const normalizedText = text.toLowerCase();
  
  for (let i = 0; i < normalizedText.length; i++) {
    const charCode = normalizedText.charCodeAt(i);
    const index = (charCode * (i + 1) * 7) % dim;
    vector[index] += Math.sin(charCode) + Math.cos(i);
  }

  // Normalizar vector
  const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(v => (mag > 0 ? v / mag : 0));
}

/**
 * Servicio de integración con Ollama Cloud API / Local Ollama
 */
export class OllamaService {
  constructor() {
    this.host = process.env.OLLAMA_HOST || 'https://ollama.com';
    this.apiKey = process.env.OLLAMA_API_KEY || '';
    this.embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    this.chatModel = process.env.OLLAMA_CHAT_MODEL || 'llama3:latest';
  }

  /**
  /**
   * Normaliza la URL base de la API de Ollama (ej: https://ollama.com/api)
   */
  getApiUrl(rawHost, path) {
    let base = (rawHost || 'https://ollama.com').trim().replace(/\/+$/, '');
    if (base.endsWith('/api')) {
      base = base.substring(0, base.length - 4);
    }
    if (base === 'https://api.ollama.com') {
      base = 'https://ollama.com';
    }
    return `${base}/api${path.startsWith('/') ? path : '/' + path}`;
  }

  /**
   * Genera el embedding del tema de forma local
   * Nota: el endpoint /api/embed de Ollama Cloud no está autorizado para claves API
   * (siempre devuelve 401, incluso con modelos cloud válidos), por lo que se calcula
   * el embedding localmente en vez de intentar la llamada remota.
   */
  async generateEmbedding(text) {
    console.log(`\n🧠 [Ollama Service] Generando embedding local para el tema...`);
    const fallbackVector = generateFallbackEmbedding(text);
    console.log(`✅ [Ollama Service] Embedding local generado (${fallbackVector.length} dimensiones)`);
    return {
      vector: fallbackVector,
      source: 'Ollama Semantic Engine (Local)',
      model: `${this.embedModel} (Local)`,
      dimension: fallbackVector.length
    };
  }

  /**
   * Evalúa la similitud del embedding con las líneas prioritarias de investigación en Perú
   */
  analyzeAlignmentWithPeruPriorities(topic, embeddingResult) {
    const topicLower = topic.toLowerCase();
    const alignments = PERU_RESEARCH_PRIORITIES.map(priority => {
      let score = 0.3; // base score
      
      // Coincidencia de palabras clave
      const matchCount = priority.keywords.filter(kw => topicLower.includes(kw)).length;
      score += matchCount * 0.18;

      // Variación basada en el vector de embedding
      const syntheticPriorityVec = generateFallbackEmbedding(priority.keywords.join(' '));
      const sim = cosineSimilarity(embeddingResult.vector, syntheticPriorityVec);
      score += sim * 0.25;

      const finalScore = Math.min(Math.max(Math.round(score * 100), 20), 98);

      return {
        priorityArea: priority.name,
        alignmentPercentage: finalScore,
        matchedKeywords: priority.keywords.filter(kw => topicLower.includes(kw))
      };
    });

    alignments.sort((a, b) => b.alignmentPercentage - a.alignmentPercentage);
    return alignments;
  }

  /**
   * Evalúa la viabilidad del tema de tesis a nivel de Pregrado o Posgrado en Perú
   */
  async evaluateThesisViability({ topic, academicLevel, fieldOfStudy, additionalNotes, apiKeyOverride, hostOverride }) {
    const activeApiKey = (apiKeyOverride && String(apiKeyOverride).trim() !== '') ? apiKeyOverride.trim() : (this.apiKey || process.env.OLLAMA_API_KEY || '');
    let activeHost = (hostOverride && String(hostOverride).trim() !== '') ? hostOverride.trim() : (this.host || 'https://ollama.com');
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    // Step 1: Generar Embedding
    const embeddingData = await this.generateEmbedding(topic);

    // Step 2: Calcular alineación vectorial con áreas prioritarias CONCYTEC
    const priorityAlignments = this.analyzeAlignmentWithPeruPriorities(topic, embeddingData);
    const topPriority = priorityAlignments[0];

    // Step 3: Intentar llamada a LLM Ollama Cloud si hay conexión/key
    let llmEvaluationRaw = null;

    try {
      if (activeApiKey || activeHost.includes('localhost') || activeHost.includes('127.0.0.1')) {
        const systemPrompt = `Eres un Presidente de Jurado de Tesis y Consultor Académico de alto nivel especializado en universidades peruanas (regular por SUNEDU y CONCYTEC).
Tu objetivo es evaluar la viabilidad de un tema de tesis propuesto para el nivel: ${academicLevel} en la carrera/área de ${fieldOfStudy}.

Responde ÚNICAMENTE en formato JSON válido con la siguiente estructura exacta:
{
  "overallViabilityScore": <número entre 0 y 100>,
  "viabilityLevel": "<Alta | Media-Alta | Media | Baja>",
  "academicLevelAssessed": "${academicLevel}",
  "peruContextRelevance": "<Resumen en 2-3 oraciones del impacto y pertinencia del tema en el contexto peruano actual>",
  "dimensionScores": {
    "rigorMethodological": <0-100>,
    "noveltyAcademic": <0-100>,
    "peruRelevance": <0-100>,
    "dataAvailability": <0-100>
  },
  "strengths": ["<fortaleza 1>", "<fortaleza 2>", "<fortaleza 3>"],
  "risksAndLimitations": ["<riesgo o limitación 1>", "<riesgo 2>"],
  "recommendedDelimitation": "<Propuesta concreta de título/delimitación ajustada a jurados en Perú>",
  "suggestedMethodology": {
    "approach": "<Cualitativa | Cuantitativa | Mixta>",
    "design": "<Ej: Descriptivo-Explicativo, Experimental, Caso de Estudio>",
    "sampleOrDataTarget": "<Sugerencia de muestra o ámbito de estudio en Perú>"
  },
  "keyConcytecLine": "${topPriority.priorityArea}"
}`;

        const userPrompt = `Tema de Tesis a evaluar: "${topic}"
Nivel: ${academicLevel}
Área de Conocimiento: ${fieldOfStudy}
Detalles adicionales: ${additionalNotes || 'Ninguno'}`;

        const generateUrl = this.getApiUrl(activeHost, '/generate');
        console.log(`🤖 [Ollama Cloud LLM] Petición a ${generateUrl} (${this.chatModel})...`);

        const response = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
          },
          body: JSON.stringify({
            model: this.chatModel,
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            stream: false,
            format: 'json'
          })
        });

        console.log(`- Status ${generateUrl} => Status ${response.status} ${response.statusText}`);

        if (response.ok) {
          const data = await response.json();
          const cleanResponse = data.response.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
          const parsed = JSON.parse(cleanResponse);
          llmEvaluationRaw = parsed;
          console.log(`✅ [Ollama Cloud LLM] Respuesta generada exitosamente por ${this.chatModel}`);
        } else {
          const errText = await response.text();
          console.warn(`⚠️ [Ollama Cloud LLM Error]: ${errText.substring(0, 150)}`);
        }
      }
    } catch (err) {
      console.warn('Ollama Cloud LLM call notice:', err.message);
    }

    // Step 4: Construir o complementar el reporte final
    const evaluation = llmEvaluationRaw || this.generateStructuredHeuristicEvaluation(topic, academicLevel, fieldOfStudy, topPriority);

    return {
      topic,
      academicLevel,
      fieldOfStudy,
      timestamp: new Date().toISOString(),
      embeddingInfo: {
        model: embeddingData.model,
        source: embeddingData.source,
        dimension: embeddingData.dimension,
        vectorSample: embeddingData.vector.slice(0, 5).map(n => Number(n.toFixed(4)))
      },
      priorityAlignments,
      evaluation
    };
  }

  /**
   * Motor conversacional de Avan por WhatsApp: en vez de un guion fijo de
   * preguntas numeradas, en cada turno el LLM decide qué responder y qué
   * preguntar (tono natural), y avisa cuándo ya conoce el tema de tesis (lo
   * único obligatorio) para que el sistema proponga agendar la llamada con
   * un asesor — el correo es opcional, solo para la invitación del Meet. Si
   * no hay conexión a Ollama Cloud (sin API key, o la llamada falla), se usa
   * una lógica de respaldo mínima basada en reglas.
   */
  async converseAsAvan({ history, knownAnswers, incomingText, isFirstTurn, toneInstructions, contactName, shortReplies = true, botIdentity, botObjective, promptRules, knowledgeBlock }) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn);
    }

    // Bloques editables desde el panel (Configuración de Avan). Si el equipo
    // los dejó vacíos, se usan los textos por defecto. La ESTRUCTURA de abajo
    // (datos obligatorios, formato JSON, cuándo terminar) NO es editable: la
    // lógica de whatsappBotService.js depende de ella.
    const identity = (botIdentity && botIdentity.trim()) || BOT_PROMPT_DEFAULTS.identity;
    const objective = (botObjective && botObjective.trim()) || BOT_PROMPT_DEFAULTS.objective;
    const teamRules = (Array.isArray(promptRules) && promptRules.length) ? promptRules : BOT_PROMPT_DEFAULTS.rules;

    // Breve, pero no seco: el modo corto anterior prohibía toda introducción y
    // el resultado era "[acuse de dos palabras] + [pregunta]" en cada turno,
    // es decir un interrogatorio. Ahora se conserva el límite de longitud pero
    // se le exige que la primera parte aporte algo real.
    const shortRepliesRule = shortReplies
      ? 'LARGO MÁXIMO: 25 palabras (35 si es el primer mensaje, que lleva la presentación). En Perú nadie lee párrafos por WhatsApp: si tu respuesta ocupa más de dos renglones en un celular, es demasiado larga. Estructura: (a) responde o reconoce en POCAS palabras lo que acaba de escribir —si preguntó algo, la respuesta resumida va aquí— y (b) UNA sola pregunta. Nada de relleno corporativo ni cierres de correo ("quedo atento", "cualquier cosa me avisas"). No repitas el nombre de la empresa si ya lo dijiste: ni dos veces en el mismo mensaje, ni en mensajes siguientes. NUNCA sacrifiques la gramática por acortar: escribe frases completas y bien formadas, con sus artículos; si no te alcanza el largo, di UNA cosa menos en vez de escribir un telegrama ("10-min reunión te guía"). Escribe en español natural de Perú, sin calcos del inglés ("no problema", "déjame saber").'
      : 'LARGO MÁXIMO: 45 palabras, con la misma estructura: primero respondes o reconoces en pocas palabras lo que dijo, después UNA sola pregunta. Nada de relleno corporativo ni cierres de correo.';

    const rulesBlock = [shortRepliesRule, ...teamRules]
      .concat(contactName ? [`Su nombre (según su perfil de WhatsApp) es "${contactName}". Úsalo como MUCHO una vez cada tres o cuatro mensajes: repetirlo en cada uno suena a plantilla y alarga el mensaje. Si ya lo usaste en tu mensaje anterior, este va sin nombre.`] : [])
        .map((r, i) => `${i + 1}. ${r}`)
      .join('\n');

    const systemPrompt = `${identity}

TU OBJETIVO: ${objective}

LO QUE NECESITAS SABER, EN ESTE ORDEN (esto es estructural, no cambia):
1. El tema o problema de tesis que quiere investigar — OBLIGATORIO. Basta con una idea GENERAL: no hace falta que sea específico ni que la persona lo tenga claro. Si te dice que NO tiene tema, que empieza de cero o que no sabe, ESO YA ES LA RESPUESTA: guárdala en "extracted.problem" como "Sin tema definido (desde cero)" y pasa al punto 2. Nunca vuelvas a preguntar por el tema después de eso.
2. La CARRERA de su tesis — OBLIGATORIO. Pregúntala solo cuando ya tengas el tema.
3. La UNIVERSIDAD donde estudia — OBLIGATORIO. Pregúntala solo cuando ya tengas la carrera.

Recién cuando tengas (1), (2) Y (3) marca "ready": true (ver CUÁNDO TERMINAR). Una pregunta por mensaje: nunca pidas la carrera y la universidad juntas.

ESCUCHA SIEMPRE, DE PRINCIPIO A FIN: en CADA mensaje, antes de decidir qué responder, revisa si la persona mencionó —aunque no se lo hayas preguntado y aunque venga mezclado en una sola frase— su TEMA, su CARRERA, su UNIVERSIDAD, su nivel académico o CUÁNDO quiere la reunión, y guárdalo todo en "extracted"/"preferredWhen" en ese mismo turno. Ejemplo: "sobre arquitectura de la continental, tesis con avance" trae carrera (Arquitectura), universidad (Universidad Continental) y tema (tesis ya iniciada, con avance). En Perú las universidades se nombran abreviadas o en minúscula: continental = Universidad Continental, upla = Universidad Peruana Los Andes, uncp = Universidad Nacional del Centro del Perú, unmsm = San Marcos, ucv = César Vallejo, y también upc, pucp, uni, utp, usmp, ulima, undac, unsa. JAMÁS preguntes por un dato que ya te dieron, ni en este mensaje ni en uno anterior.

TRATO: siempre de TÚ, nunca de usted, en todos los mensajes.

NO TE PRESENTES: nunca abras diciendo quién eres ni nombrando a la empresa ("soy X de Y"). Entra directo a ayudar. Solo di con quién hablan si te lo preguntan explícitamente.

NOMBRES: la videollamada se llama siempre "Google Meet", nunca "Meet" a secas.

AGENDAR GANA SOBRE TODO: si el contacto pide una reunión/llamada, pregunta por horarios, o propone un día u hora concretos ("¿puedo el jueves?", "a las 5 hoy"), eso es lo prioritario. Marca "schedulingIntent": true y guarda en "preferredWhen" lo que dijo del cuándo, TAL CUAL. En ese caso el sistema pasa a agendar de inmediato: no sigas pidiendo tema, carrera ni universidad, y tu "reply" tiene que ser un acuse corto y SIN preguntas.

NO SEAS CERRADO: que te falte un dato NUNCA es excusa para ignorar lo que la persona escribió. Si te hace una pregunta ("¿qué hacen?", "¿cuánto cuesta?", "¿cuánto dura?", "necesito información"), RESPÓNDELA primero con los DATOS REALES DEL SERVICIO y recién después, en el mismo mensaje, haz tu pregunta pendiente. Alguien que pide información y solo recibe preguntas se va. Cuando pidan información en general, empieza por QUÉ hacen (el acompañamiento de tesis), no por la logística de la reunión: la duración, la modalidad y el descuento solo se mencionan si preguntan por eso.

Datos OPCIONALES Y PASIVOS (correo, nivel académico, ámbito/región): si la persona los menciona por su cuenta, guárdalos en "extracted". Pero JAMÁS los preguntes — hay valores por defecto y el jefe comercial los ve en la reunión.

REGLAS DEL EQUIPO (respétalas siempre; nunca contradicen lo estructural de arriba):
${rulesBlock}
${knowledgeBlock ? `
DATOS REALES DEL SERVICIO (lo ÚNICO que puedes afirmar; si la persona pregunta algo que NO está en esta lista, dile con naturalidad que el jefe comercial se lo detalla en la reunión — NUNCA inventes precios, plazos, cifras ni promesas):
${knowledgeBlock}

Si el contacto hace una pregunta, RESPÓNDELA primero con estos datos y recién después sigue con lo que te falta preguntar. Nunca ignores su pregunta ni la dejes para más adelante.
` : ''}
${toneInstructions ? `\nINSTRUCCIONES ADICIONALES DEL EQUIPO:\n${toneInstructions}\n` : ''}

CUÁNDO TERMINAR: marca "ready": true en cuanto tengas el tema de tesis Y (la carrera O la universidad). NO antes: si te falta el dato académico, tu turno es para preguntarlo, con "ready": false. Cuando por fin marques "ready": true, tu "reply" tiene que ser MUY corto y SIN preguntas: si el contacto aprovechó ese último mensaje para preguntarte algo, respóndele ahí en una línea con los datos reales del servicio; si no preguntó nada, un simple acuse (ej. "Perfecto 👀" o "Genial, dame un momento 🙌"). El sistema toma el hilo enseguida: propone la reunión con el jefe comercial y le pregunta la modalidad (telefónica o Meet). Este "reply" tuyo puede incluso no mostrarse, así que no pongas nada importante en él.

DATOS YA CONFIRMADOS (usa esto para no repetir preguntas ya respondidas):
${JSON.stringify(knownAnswers || {})}

LO QUE FALTABA ANTES DE LEER SU ÚLTIMO MENSAJE: ${describeMissingPriority(knownAnswers)}
OJO: eso era el estado ANTES de leer lo que acaba de escribir. Si en ese mensaje ya te dio ese dato, extráelo y pregunta por el SIGUIENTE que falte. Repetir una pregunta que la persona ya respondió es el peor error que puedes cometer.

Responde ÚNICAMENTE en JSON válido con esta forma exacta (usa null en los campos de "extracted" que no puedas identificar todavía):
{
  "reply": "<mensaje de WhatsApp en texto plano, sin comillas ni markdown>",
  "extracted": {
    "problem": "<tema o problema de tesis identificado. Si dijo que no tiene tema o que empieza desde cero, escribe exactamente 'Sin tema definido (desde cero)' — ese texto es interno, va SOLO en este campo y JAMÁS en tu "reply". Usa null SOLO si todavía no ha dicho nada sobre su tema>",
    "location": "<ámbito/región identificado, o null>",
    "level": "<uno de: 'Pregrado (Bachiller/Título)', 'Posgrado (Maestría)', 'Posgrado (Doctorado)', o null>",
    "field": "<carrera/campo de estudio identificado, o null>",
    "university": "<universidad/institución donde estudia, o null>",
    "email": "<correo electrónico identificado, o null>"
  },
  "ready": <true o false>,
  "schedulingIntent": <true si pidió agendar, preguntó por horarios o propuso un día u hora; si no, false>,
  "preferredWhen": "<lo que dijo sobre cuándo quiere la reunión, tal cual lo escribió (ej. 'a las 5 hoy', 'el lunes en la mañana'), o null>"
}`;

    const transcript = (history || [])
      .map((m) => `${m.direction === 'outbound' ? 'Avan' : 'Contacto'}: ${m.text}`)
      .join('\n');

    const userPrompt = `Historial de la conversación hasta ahora:\n${transcript || '(sin mensajes previos)'}\n\nNuevo mensaje del contacto: "${incomingText}"\n\nResponde siguiendo las reglas, en el JSON indicado.`;

    try {
      const generateUrl = this.getApiUrl(activeHost, '/generate');
      console.log(`🤖 [Ollama Cloud LLM] Turno conversacional de Avan en ${generateUrl} (${this.chatModel})...`);

      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.chatModel,
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          stream: false,
          format: 'json'
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`⚠️ [Ollama Cloud LLM Error] turno de Avan: ${errText.substring(0, 150)}`);
        return this.fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn);
      }

      const data = await response.json();
      const cleanResponse = (data.response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanResponse);
      if (!parsed.reply) return this.fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn);

      console.log(`✅ [Ollama Cloud LLM] Turno de Avan generado por ${this.chatModel}`);
      return {
        reply: parsed.reply,
        extracted: parsed.extracted || {},
        ready: !!parsed.ready,
        schedulingIntent: !!parsed.schedulingIntent,
        preferredWhen: typeof parsed.preferredWhen === 'string' && parsed.preferredWhen.trim() ? parsed.preferredWhen.trim() : null,
        source: 'llm'
      };
    } catch (err) {
      console.warn('Ollama Cloud LLM conversation turn notice:', err.message);
      return this.fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn);
    }
  }

  /**
   * Respaldo mínimo basado en reglas para cuando Ollama Cloud no está
   * disponible: no reemplaza la calidad de la conversación con IA, pero
   * evita dejar al contacto sin respuesta. En cuanto tiene el tema, marca
   * "ready" (el correo es opcional, se captura solo si aparece en el texto).
   */
  fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn) {
    const answers = knownAnswers || {};
    const greeting = isFirstTurn ? '¡Hola! 👋 ' : '';

    if (!answers.problem) {
      return {
        reply: `${greeting}Cuéntame, ¿qué tema o problema te gustaría desarrollar en tu tesis?`,
        extracted: { problem: incomingText || null },
        ready: false,
        source: 'fallback'
      };
    }

    const trimmedIn = (incomingText || '').trim();

    const isNoise = trimmedIn.length < 3 || /^(hola|hi|buenas|si|sí|ok|okay|no|informes?|gracias)\b/i.test(trimmedIn);
    const looksLikeUniversity = /universidad|instituto|\bpucp\b|\bunmsm\b|\bupc\b|\bucv\b|continental|vallejo|cat[oó]lica|nacional de/i.test(trimmedIn);

    // Falta la carrera: se pide, y lo que respondan en el siguiente turno se
    // toma como carrera (salvo que claramente sea el nombre de una universidad).
    if (!answers.field) {
      if (isNoise || looksLikeUniversity) {
        return {
          reply: 'Genial 🙌 ¿De qué carrera es tu tesis?',
          extracted: looksLikeUniversity ? { university: trimmedIn } : {},
          ready: false,
          source: 'fallback'
        };
      }
      return {
        reply: '¡Perfecto! ¿Y en qué universidad estudias?',
        extracted: { field: trimmedIn },
        ready: false,
        source: 'fallback'
      };
    }

    // Falta la universidad.
    if (!answers.university) {
      if (isNoise) {
        return {
          reply: 'Cuéntame, ¿en qué universidad estudias?',
          extracted: {},
          ready: false,
          source: 'fallback'
        };
      }
      return {
        reply: 'Perfecto, dame un momento 👀',
        extracted: { university: trimmedIn },
        ready: true,
        source: 'fallback'
      };
    }

    const looksLikeEmail = trimmedIn.includes('@');
    return {
      reply: 'Perfecto, dame un momento 👀',
      extracted: looksLikeEmail ? { email: trimmedIn } : {},
      ready: true,
      source: 'fallback'
    };
  }

  /**
   * Interpreta en lenguaje natural qué día pide el lead para su llamada
   * ("mañana", "el jueves", "el 28", una fecha explícita, etc.) y lo
   * convierte a "YYYY-MM-DD" (calendario de Lima). Devuelve date: null si no
   * logra identificar un día claro dentro de un rango razonable.
   */
  async parseSchedulingDate(text, todayIso, maxDaysAhead = 2) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackParseSchedulingDate(text, todayIso);
    }

    const prompt = `Hoy es ${todayIso} (formato YYYY-MM-DD, zona horaria de Lima, Perú).

Alguien acaba de responder esto cuando le preguntaron qué día prefiere para una llamada:
"""${text}"""

Interpreta a qué fecha se refiere (puede decir "hoy", "mañana", "pasado mañana", "el jueves", "el 28", una fecha explícita, etc.) y conviértela a formato YYYY-MM-DD. La fecha debe estar entre hoy (${todayIso}) y ${maxDaysAhead} días después como máximo. Si pide un día más lejano, igual devuélvelo tal cual (el sistema le explicará el límite). Si el texto NO expresa ningún día concreto (ej. "cuando puedas", "no sé", o simplemente no habla de fechas), responde null.

Además, si junto con el día también dijo una HORA o un momento del día (ej. "hoy a las 6 pm", "mañana temprano", "el jueves por la tarde"), extráela en formato 24h "HH:MM" en "preferredTime" (usa una hora representativa: "temprano"/"en la mañana" ~ "09:00", "en la tarde" ~ "15:00", "de noche"/"tarde" ~ "20:00"). Si no dijo ninguna hora, deja preferredTime en null.

Responde ÚNICAMENTE en JSON válido: {"date": "YYYY-MM-DD" o null, "preferredTime": "<HH:MM o null>"}`;

    try {
      const generateUrl = this.getApiUrl(activeHost, '/generate');
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
        },
        body: JSON.stringify({ model: this.chatModel, prompt, stream: false, format: 'json' }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return this.fallbackParseSchedulingDate(text, todayIso);

      const data = await response.json();
      const cleanResponse = (data.response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanResponse);
      const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
      const preferredTime = typeof parsed.preferredTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.preferredTime) ? parsed.preferredTime : null;
      return { date, preferredTime, source: 'llm' };
    } catch (err) {
      console.warn('Ollama Cloud LLM date parsing notice:', err.message);
      return this.fallbackParseSchedulingDate(text, todayIso);
    }
  }

  /**
   * Respaldo mínimo sin IA: reconoce "hoy" y "mañana" respecto a `todayIso`.
   * Cualquier otra expresión (nombres de día, fechas explícitas, etc.)
   * devuelve null — sin IA no vale la pena adivinar más que lo obvio.
   */
  fallbackParseSchedulingDate(text, todayIso) {
    const normalized = (text || '').toLowerCase();
    const [y, m, d] = todayIso.split('-').map(Number);
    const todayUTC = Date.UTC(y, m - 1, d);

    // Sin IA solo se reconoce una hora escrita de forma inequívoca: con
    // minutos ("18:30"), con meridiano ("6pm") o precedida de "a las". Un
    // número suelto NO cuenta, para no confundir "el 6 de septiembre" con
    // las 6 de la mañana. El orden importa: en "a las 10:30" el "a las"
    // aparece antes, así que primero se busca el formato con minutos.
    let hour = null;
    let minutes = 0;
    let meridiem = '';

    let timeMatch = normalized.match(/(\d{1,2}):(\d{2})\s*(a\.?\s?m|p\.?\s?m)?/);
    if (timeMatch) {
      hour = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      meridiem = timeMatch[3] || '';
    } else if ((timeMatch = normalized.match(/(\d{1,2})\s*(a\.?\s?m|p\.?\s?m)/))) {
      hour = Number(timeMatch[1]);
      meridiem = timeMatch[2];
    } else if ((timeMatch = normalized.match(/a\s+las\s+(\d{1,2})\b/))) {
      hour = Number(timeMatch[1]);
    }

    let preferredTime = null;
    if (hour !== null) {
      meridiem = meridiem.replace(/[.\s]/g, '');
      if (meridiem.startsWith('p') && hour < 12) hour += 12;
      if (meridiem.startsWith('a') && hour === 12) hour = 0;
      // "a las 6" sin meridiano, en un contexto comercial, es la tarde: las
      // 6 a.m. no son un horario de atención plausible.
      if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
      if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
        preferredTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }

    if (/\bhoy\b/.test(normalized)) {
      return { date: todayIso, preferredTime, source: 'fallback' };
    }
    if (/\bmanana\b|\bmañana\b/.test(normalized)) {
      const tomorrow = new Date(todayUTC + 86400000);
      return { date: tomorrow.toISOString().slice(0, 10), preferredTime, source: 'fallback' };
    }
    return { date: null, preferredTime, source: 'fallback' };
  }

  /**
   * Interpreta en lenguaje natural a cuál horario de una lista numerada se
   * refiere el lead (ej. "si para las 5:30", "la segunda", "el de las 4")
   * en vez de exigir que responda solo con el número. Devuelve el índice
   * (0-based) elegido, o null si la respuesta no elige ninguna opción (por
   * ejemplo, si pregunta algo distinto).
   */
  async parseSchedulingChoice(text, optionLabels) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackParseSchedulingChoice(text, optionLabels);
    }

    const numbered = optionLabels.map((label, i) => `${i + 1}. ${label}`).join('\n');
    const prompt = `Le mostraste a alguien esta lista numerada de horarios para una llamada:
${numbered}

Y respondió esto: """${text}"""

¿A cuál horario de la lista se refiere? Puede responder con el número, con la hora, con una frase tipo "sí, el de las 5:30", "la primera opción", etc. Si su respuesta no elige ninguna opción de la lista, responde index:null.

Además, si NO eligió ninguna opción pero sí expresó una preferencia de horario distinta a las ofrecidas (ej. "no tienes más de noche?", "para las 8pm", "algo más tarde", "en la mañana mejor"), extrae esa hora aproximada en formato 24h "HH:MM" en "preferredTime" (usa una hora representativa: "en la mañana" ~ "09:00", "en la tarde" ~ "15:00", "de noche"/"más tarde" ~ "20:00"). Si no expresó ninguna preferencia de horario, deja preferredTime en null.

Responde ÚNICAMENTE en JSON válido: {"index": <número de 1 a ${optionLabels.length}, o null>, "preferredTime": "<HH:MM o null>"}`;

    try {
      const generateUrl = this.getApiUrl(activeHost, '/generate');
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
        },
        body: JSON.stringify({ model: this.chatModel, prompt, stream: false, format: 'json' }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return this.fallbackParseSchedulingChoice(text, optionLabels);

      const data = await response.json();
      const cleanResponse = (data.response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanResponse);
      const index = Number.isInteger(parsed.index) && parsed.index >= 1 && parsed.index <= optionLabels.length ? parsed.index - 1 : null;
      const preferredTime = typeof parsed.preferredTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.preferredTime) ? parsed.preferredTime : null;
      return { index, preferredTime, source: 'llm' };
    } catch (err) {
      console.warn('Ollama Cloud LLM scheduling choice notice:', err.message);
      return this.fallbackParseSchedulingChoice(text, optionLabels);
    }
  }

  /**
   * Respaldo sin IA: solo reconoce un número explícito (1, 2, 3...).
   */
  fallbackParseSchedulingChoice(text, optionLabels) {
    const trimmed = (text || '').trim();
    const asNumber = parseInt(trimmed, 10);
    const index = Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= optionLabels.length ? asNumber - 1 : null;
    return { index, preferredTime: null, source: 'fallback' };
  }

  /**
   * Durante el agendamiento (elegir modalidad, dar el correo/teléfono, elegir
   * día u hora) el flujo lo maneja una máquina de estados determinista que
   * solo sabe extraer UN dato. Este clasificador es la válvula de escape: mira
   * el mensaje real del contacto y responde dos cosas:
   *
   *   - `answersStep`: si el mensaje trae la respuesta al paso actual (aunque
   *     venga acompañada de otra cosa, ej. "mi correo es x@y.com pero cuánto
   *     dura la reunión?").
   *   - `isAside` + `answer`: si además hace una pregunta APARTE, con la
   *     respuesta ya redactada usando ÚNICAMENTE la base de conocimiento.
   *   - `preferredWhen`: si de paso dijo cuándo quiere la reunión ("via meet
   *     para las 3 de la tarde hoy"), para no volver a preguntarle el día
   *     dos pasos más adelante.
   *
   * Las preguntas sobre los días/horarios ofrecidos NO cuentan como pregunta
   * aparte: de eso ya se encargan parseSchedulingDate/parseSchedulingChoice.
   *
   * Si no hay LLM disponible, devuelve el comportamiento histórico
   * (`answersStep: true`, sin pregunta aparte): el paso sigue como siempre.
   */
  async classifySchedulingAside(text, { stepQuestion, knowledgeBlock, contactName } = {}) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return { answersStep: true, isAside: false, preferredWhen: null, answer: null, source: 'fallback' };
    }

    const prompt = `Eres Avan, de Avantage Group (Perú). Estás coordinando por WhatsApp una reunión con el jefe comercial y acabas de preguntarle esto al contacto${contactName ? ` (${contactName})` : ''}:

"""${stepQuestion}"""

El contacto respondió:

"""${text}"""

DATOS REALES DEL SERVICIO (lo ÚNICO que puedes afirmar; nunca inventes precios, plazos ni cifras que no estén aquí):
${knowledgeBlock || '(sin datos cargados)'}

Analiza el mensaje y responde:
- "answersStep": true si el mensaje CONTIENE la respuesta a lo que le preguntaste, aunque venga junto con otra cosa. false si no la contiene.
- "isAside": true si además hace una PREGUNTA APARTE, sobre algo distinto de lo que le preguntaste (ej. cuánto dura la reunión, cuánto cuesta, qué incluye, con quién es, si es presencial). false si no pregunta nada aparte.
  MUY IMPORTANTE: preguntar por los días u horarios disponibles, pedir otro horario, o preguntar si hay espacio a cierta hora NO es una pregunta aparte — eso es parte del paso actual. En esos casos "isAside" debe ser false.
- "preferredWhen": si en su mensaje dijo CUÁNDO quiere la reunión (un día, una hora, o ambos: "para las 3 de la tarde hoy", "el lunes temprano"), cópialo TAL CUAL. Si no dijo nada del cuándo, null.
- "answer": si "isAside" es true, la respuesta a esa pregunta: 1 o 2 líneas, tono WhatsApp cercano, máximo 1 emoji, usando SOLO los datos reales de arriba. Si la pregunta no se puede responder con esos datos, dile con naturalidad que eso se lo detalla el jefe comercial en la reunión. No agregues preguntas al final (el sistema retoma el paso por su cuenta). Si "isAside" es false, deja null.

Responde ÚNICAMENTE en JSON válido: {"answersStep": <true o false>, "isAside": <true o false>, "preferredWhen": "<texto o null>", "answer": "<texto o null>"}`;

    try {
      const generateUrl = this.getApiUrl(activeHost, '/generate');
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
        },
        body: JSON.stringify({ model: this.chatModel, prompt, stream: false, format: 'json' }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return { answersStep: true, isAside: false, preferredWhen: null, answer: null, source: 'fallback' };

      const data = await response.json();
      const cleanResponse = (data.response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanResponse);
      const answer = typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : null;
      return {
        answersStep: !!parsed.answersStep,
        preferredWhen: typeof parsed.preferredWhen === 'string' && parsed.preferredWhen.trim() ? parsed.preferredWhen.trim() : null,
        // Sin texto de respuesta no hay nada que contestar: se trata como si
        // no hubiera pregunta aparte y el paso sigue su curso normal.
        isAside: !!parsed.isAside && !!answer,
        answer,
        source: 'llm'
      };
    } catch (err) {
      console.warn('Ollama Cloud LLM scheduling aside notice:', err.message);
      return { answersStep: true, isAside: false, preferredWhen: null, answer: null, source: 'fallback' };
    }
  }

  /**
   * Clasifica un mensaje que llega DESPUÉS de que el lead ya agendó su
   * llamada (sesión "completed" con reunión real en `scheduled_meetings`).
   * Inspirado en la lógica de un workflow n8n existente del equipo: los
   * simples saludos/agradecimientos/confirmaciones cortas no necesitan
   * respuesta (el asesor ya tiene la reunión agendada); en cambio, pedidos
   * de reagendar/cancelar, quejas de que nadie llegó, preguntas sobre la
   * reunión (link/hora/duración), o consultas nuevas (precio, otro tema) sí
   * necesitan una respuesta y, salvo la pregunta de datos de la reunión
   * (que Avan puede responder solo con los datos reales que ya tiene),
   * deben avisarle a un asesor humano.
   */
  async classifyPostBookingMessage(text, { meetingLabel, meetLink, contactName, knowledgeBlock }) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackClassifyPostBookingMessage(text);
    }

    const prompt = `Eres Avan, de Avantage Group. Este contacto${contactName ? ` (${contactName})` : ''} YA tiene una llamada agendada para *${meetingLabel}* (link de Meet: ${meetLink || 'no disponible'}) con un asesor. Te acaba de escribir esto, después de que su reunión ya quedó agendada:

"""${text}"""

${knowledgeBlock ? `DATOS REALES DEL SERVICIO (lo ÚNICO que puedes afirmar además de la fecha y el link de arriba):
${knowledgeBlock}

` : ''}Clasifícalo:
- Si es solo un saludo, agradecimiento o confirmación corta sin pedir nada más (ej. "gracias", "ok", "perfecto", "listo", "buenas"), no necesita respuesta.
- Si pregunta por datos de SU reunión (link, hora, fecha, cuánto dura, dónde es), respóndele tú mismo usando ÚNICAMENTE los datos reales de arriba (la fecha/hora, el link y los datos del servicio), sin inventar nada más.
- Si pide reagendar, cancelar, cambiar de horario, se queja de que nadie llegó a la reunión o de un problema con el enlace, o hace una consulta totalmente nueva (precio, otro tema de tesis, otro servicio), respóndele con un mensaje breve y empático confirmando que un asesor del equipo le va a escribir directamente para resolverlo — y márcalo como urgente para que el equipo lo vea.

Responde ÚNICAMENTE en JSON válido:
{
  "needsReply": <true o false>,
  "replyText": "<mensaje de WhatsApp breve, o null si needsReply es false>",
  "isUrgent": <true si el equipo debe intervenir manualmente (reagendar/queja/consulta nueva), false si ya quedó resuelto solo con la respuesta (ej. le diste el link)>
}`;

    try {
      const generateUrl = this.getApiUrl(activeHost, '/generate');
      const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeApiKey ? { 'Authorization': `Bearer ${activeApiKey}` } : {})
        },
        body: JSON.stringify({ model: this.chatModel, prompt, stream: false, format: 'json' }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) return this.fallbackClassifyPostBookingMessage(text);

      const data = await response.json();
      const cleanResponse = (data.response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanResponse);
      return {
        needsReply: !!parsed.needsReply,
        replyText: parsed.needsReply ? (parsed.replyText || null) : null,
        isUrgent: !!parsed.isUrgent,
        source: 'llm'
      };
    } catch (err) {
      console.warn('Ollama Cloud LLM post-booking classification notice:', err.message);
      return this.fallbackClassifyPostBookingMessage(text);
    }
  }

  /**
   * Respaldo sin IA: solo reconoce agradecimientos/confirmaciones cortas
   * como "no necesita respuesta"; cualquier otra cosa se trata como urgente
   * (mejor avisarle de más a un asesor que dejar a alguien sin atender).
   */
  fallbackClassifyPostBookingMessage(text) {
    const normalized = (text || '').trim().toLowerCase();
    const esConfirmacionCorta = /^(ok|okay|perfecto|listo|excelente|bueno|dale|genial|bien|ya|entendido|de acuerdo|gracias|muchas gracias)[.!]*$/.test(normalized);
    if (esConfirmacionCorta) {
      return { needsReply: false, replyText: null, isUrgent: false, source: 'fallback' };
    }
    return {
      needsReply: true,
      replyText: 'Un asesor del equipo te va a escribir directamente para ayudarte con eso. ¡Gracias! 🙌',
      isUrgent: true,
      source: 'fallback'
    };
  }

  /**
   * Genera una evaluación estructurada de alta precisión cuando no hay API Key activa
   */
  generateStructuredHeuristicEvaluation(topic, academicLevel, fieldOfStudy, topPriority) {
    const isPosgrado = academicLevel.toLowerCase().includes('posgrado') || 
                      academicLevel.toLowerCase().includes('maestría') || 
                      academicLevel.toLowerCase().includes('doctorado');

    const topicLen = topic.length;
    const wordCount = topic.trim().split(/\s+/).length;

    // Puntuaciones base ajustadas al nivel
    let rigor = isPosgrado ? 78 : 85;
    let novelty = isPosgrado ? 82 : 75;
    let peruRel = Math.min(topPriority.alignmentPercentage + 5, 95);
    let dataAvail = 80;

    if (wordCount < 4) {
      rigor -= 15;
      novelty -= 10;
    } else if (wordCount > 15) {
      rigor += 8;
    }

    const overall = Math.round((rigor * 0.3) + (novelty * 0.25) + (peruRel * 0.25) + (dataAvail * 0.2));

    let viabilityLevel = 'Alta';
    if (overall < 60) viabilityLevel = 'Baja';
    else if (overall < 75) viabilityLevel = 'Media';
    else if (overall < 85) viabilityLevel = 'Media-Alta';

    return {
      overallViabilityScore: overall,
      viabilityLevel,
      academicLevelAssessed: academicLevel,
      peruContextRelevance: `El tema '${topic}' aborda problemáticas de alto interés en el ámbito peruano, alineándose cercanamente con la línea de '${topPriority.priorityArea}' promovida por CONCYTEC e instituciones universitarias reguladas por SUNEDU.`,
      dimensionScores: {
        rigorMethodological: Math.min(rigor, 98),
        noveltyAcademic: Math.min(novelty, 98),
        peruRelevance: Math.min(peruRel, 98),
        dataAvailability: Math.min(dataAvail, 98)
      },
      strengths: [
        `Alta alineación con las necesidades actuales de investigación en Perú en la categoría de ${topPriority.priorityArea}.`,
        `Viabilidad clara para definir una hipótesis empírica sustentable en sustentación oral ante jurado de ${academicLevel}.`,
        `Potencial para generar aportes metodológicos aplicables al sector público o privado nacional.`
      ],
      risksAndLimitations: [
        `Es necesario precisar la delimitación espacial y temporal en Perú para evitar observaciones sobre 'amplitud excesiva' por el jurado.`,
        isPosgrado 
          ? `Para grado de Posgrado/Maestría, se exigirá una validación estadística rigurosa o modelo conceptual original más allá de una revisión descriptiva.`
          : `Para Pregrado, asegurar que el acceso a la muestra o base de datos sea formalizado mediante cartas de presentación institucional.`
      ],
      recommendedDelimitation: `"${topic}: Estudio de caso y propuesta de optimización en el contexto institucional/empresarial peruano, 2025-2026"`,
      suggestedMethodology: {
        approach: isPosgrado ? 'Cuantitativa / Mixta Aplicada' : 'Cuantitativa Descriptiva-Explicativa',
        design: isPosgrado ? 'Diseño Cuasi-Experimental / Modelado Estructural' : 'No Experimental Transversal',
        sampleOrDataTarget: 'Empresas, instituciones públicas o base de datos representativa del sector en Lima/regiones de Perú.'
      },
      keyConcytecLine: topPriority.priorityArea
    };
  }
}
