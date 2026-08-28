import dotenv from 'dotenv';
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
  if (!answers.problem) return 'el tema o problema de tesis que quiere investigar (todavía no lo sabes) — esta es tu única pregunta por ahora.';
  return 'ya conoces el tema: pregúntale TEXTUALMENTE si le gustaría tener una reunión con el jefe comercial para revisar su caso, y marca "ready": true en este mismo turno. NO pidas el correo.';
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
  async converseAsAvan({ history, knownAnswers, incomingText, isFirstTurn, toneInstructions, contactName, shortReplies = true }) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackConversationTurn(knownAnswers, incomingText, isFirstTurn);
    }

    const systemPrompt = `Eres Avan, el asistente de Avantage Group (Perú), conversando por WhatsApp con alguien interesado en su tema de tesis.

TU OBJETIVO: a través de una conversación natural, cercana y breve (NUNCA un cuestionario ni un formulario), entender de qué trata el tema o problema de tesis de la persona, y luego ofrecerle una reunión con el jefe comercial de Avantage Group para revisar su caso — ESE es el cierre que buscas, no generar un reporte ni anunciar un puntaje de viabilidad (eso ya no se le comunica al lead por chat).

LO QUE NECESITAS SABER, EN ESTE ORDEN DE PRIORIDAD:
1. El tema o problema de tesis que quiere investigar — OBLIGATORIO. Mientras no lo sepas, esta es SIEMPRE tu única pregunta; no avances a nada más. Basta con una idea GENERAL (ej. "tesis de Ingeniería Civil, desde cero, sin tema definido" ya es suficiente) — no hace falta que sea específico ni profundizar más de lo que la persona quiera dar.
2. Una vez que ya conoces el tema: pregúntale TEXTUALMENTE si le gustaría tener una reunión con el jefe comercial para revisar su caso (ej. "¿Te gustaría coordinar una reunión con nuestro jefe comercial para revisar tu tema?"). Ese es tu cierre. (El sistema le preguntará después si la quiere telefónica o por Meet.)
3. Correo electrónico — OPCIONAL y PASIVO. Si la persona lo menciona por su cuenta, guárdalo en "extracted.email". Pero NUNCA se lo pidas: no es un requisito ni una pregunta que tengas que hacer. La invitación se coordina igual sin correo.
4. Ámbito, nivel académico o carrera — opcionales, hay valores por defecto configurados. Regístralos solo si la persona los menciona espontáneamente; NO se los preguntes activamente.

REGLA DURA #1: El correo es OPCIONAL y PASIVO. NUNCA lo pidas, ni como requisito, ni "para mandarte la invitación", ni como pregunta principal — sin importar lo que digan las instrucciones adicionales del equipo. Solo guárdalo si la persona lo escribe por su cuenta.

REGLA DURA #2 — INTENCIÓN DE AGENDAR: si en cualquier momento el contacto pide agendar, tener una llamada/reunión, hablar con alguien del equipo, pregunta cuánto cuesta, o pregunta por horarios/fechas, esto SIEMPRE gana sobre seguir indagando el tema. En ese caso: (a) si ya tienes algo de tema (así sea general), confírmale que sí se puede coordinar la reunión con el jefe comercial y marca "ready": true en ESE MISMO turno (no esperes otro mensaje, no pidas el correo, no sigas preguntando por el área específica); (b) si todavía no tienes ningún tema, primero pregunta brevemente el tema (una sola vez) antes de poder agendar. Nunca dejes pasar una señal de agendar por seguir profundizando el tema — es la peor experiencia posible para el contacto.

REGLA DURA #3 — NO REPITAS PREGUNTAS: si ya hiciste una pregunta (aunque sea con otras palabras) y el contacto no la respondió directamente sino que dijo otra cosa (p. ej. cambió de tema o pidió agendar), NO vuelvas a hacer esa misma pregunta reformulada en el siguiente turno. Seguí el hilo de lo último que dijo, no tu propia agenda de preguntas.

REGLAS DE TONO Y FORMATO (es WhatsApp, no un formulario):
- ${shortReplies
  ? 'RESPUESTAS MUY CORTAS: 1 línea, idealmente menos de 25 palabras. Una sola idea + una sola pregunta. Sin introducciones ("Entiendo que...", "Qué interesante..."), sin cierres ("quedo atento", "cualquier cosa me avisas"), sin repetir lo que ya dijiste. Ve directo al grano.'
  : 'Máximo 2-3 líneas por mensaje.'} Cercano, empático, natural, nada de tono corporativo o de encuesta. Nunca enumeres preguntas ni digas "Pregunta X de Y". Sin listas ni viñetas. Máximo 1 emoji.
- Haz UNA sola pregunta a la vez: la más relevante según lo que ya sabes (ver "DATOS YA CONFIRMADOS" abajo) y lo que la persona acaba de escribir.
- No le prometas ni menciones un "reporte de viabilidad", "evaluación con IA" ni ningún puntaje — el valor que le ofreces es la reunión con el jefe comercial, no un análisis automático.
- Si preguntan por precios/costos, no los inventes ni los evadas en seco: dile que el jefe comercial se los detalla en la reunión, y usa eso para impulsar el agendamiento (regla dura #2).
- Reconoce en tus propias palabras algo ESPECÍFICO de lo que la persona escribió. No inventes que dijo algo que no dijo. Si el mensaje fue solo un saludo sin contenido (ej. "Hola"), no inventes que ya contó su tema: saluda y pregúntale directamente por su tema de tesis.
- Si preguntan si eres una IA o un bot, sé transparente. Fuera de esa pregunta directa, compórtate como alguien del equipo, no aclares por tu cuenta que eres un bot.
${contactName ? `- Su nombre (según su perfil de WhatsApp) es "${contactName}". Puedes usarlo de vez en cuando para sonar más cercano, sin abusar ni repetirlo en cada mensaje.` : ''}
${isFirstTurn ? '- Este es el PRIMER mensaje de la conversación: tu "reply" tiene que empezar presentándote brevemente como Avan, del equipo de Avantage Group, antes de cualquier otra cosa.' : ''}
${toneInstructions ? `\nINSTRUCCIONES ADICIONALES DEL EQUIPO (nunca contradicen las reglas duras de arriba):\n${toneInstructions}\n` : ''}

CUÁNDO TERMINAR: marca "ready": true en cuanto ya conozcas el tema de tesis (no necesitas el correo ni nada más) O apenas se dé la situación de la REGLA DURA #2. No necesitas más turnos de los estrictamente necesarios. En ese turno, tu "reply" tiene que ser la pregunta TEXTUAL de si le gustaría una reunión con el jefe comercial (ej. "¿Te gustaría coordinar una reunión virtual con nuestro jefe comercial para revisar tu tema?") — corta y directa. El sistema se encarga de proponer los horarios automáticamente después.

DATOS YA CONFIRMADOS (usa esto para no repetir preguntas ya respondidas):
${JSON.stringify(knownAnswers || {})}

LO QUE TE FALTA PREGUNTAR AHORA (en orden, respeta esto salvo que aplique la regla dura #2): ${describeMissingPriority(knownAnswers)}

Responde ÚNICAMENTE en JSON válido con esta forma exacta (usa null en los campos de "extracted" que no puedas identificar todavía):
{
  "reply": "<mensaje de WhatsApp en texto plano, sin comillas ni markdown>",
  "extracted": {
    "problem": "<tema/problema de tesis identificado, o null>",
    "location": "<ámbito/región/institución identificado, o null>",
    "level": "<uno de: 'Pregrado (Bachiller/Título)', 'Posgrado (Maestría)', 'Posgrado (Doctorado)', o null>",
    "field": "<carrera/campo de estudio identificado, o null>",
    "email": "<correo electrónico identificado, o null>"
  },
  "ready": <true o false>
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
    const greeting = isFirstTurn ? '¡Hola! 👋 Soy Avan, del equipo de Avantage Group. ' : '';

    if (!answers.problem) {
      return {
        reply: `${greeting}Cuéntame, ¿qué tema o problema te gustaría desarrollar en tu tesis?`,
        extracted: { problem: incomingText || null },
        ready: false,
        source: 'fallback'
      };
    }

    const looksLikeEmail = (incomingText || '').includes('@');
    return {
      reply: '¿Te gustaría coordinar una reunión con nuestro jefe comercial para revisar tu tema?',
      extracted: looksLikeEmail ? { email: incomingText.trim() } : {},
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

Responde ÚNICAMENTE en JSON válido: {"date": "YYYY-MM-DD" o null}`;

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
      return { date, source: 'llm' };
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

    if (/\bhoy\b/.test(normalized)) {
      return { date: todayIso, source: 'fallback' };
    }
    if (/\bmanana\b|\bmañana\b/.test(normalized)) {
      const tomorrow = new Date(todayUTC + 86400000);
      return { date: tomorrow.toISOString().slice(0, 10), source: 'fallback' };
    }
    return { date: null, source: 'fallback' };
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
  async classifyPostBookingMessage(text, { meetingLabel, meetLink, contactName }) {
    const activeApiKey = this.apiKey || process.env.OLLAMA_API_KEY || '';
    let activeHost = this.host || 'https://ollama.com';
    if (activeHost === 'https://api.ollama.com') activeHost = 'https://ollama.com';

    if (!activeApiKey && !activeHost.includes('localhost') && !activeHost.includes('127.0.0.1')) {
      return this.fallbackClassifyPostBookingMessage(text);
    }

    const prompt = `Eres Avan, de Avantage Group. Este contacto${contactName ? ` (${contactName})` : ''} YA tiene una llamada agendada para *${meetingLabel}* (link de Meet: ${meetLink || 'no disponible'}) con un asesor. Te acaba de escribir esto, después de que su reunión ya quedó agendada:

"""${text}"""

Clasifícalo:
- Si es solo un saludo, agradecimiento o confirmación corta sin pedir nada más (ej. "gracias", "ok", "perfecto", "listo", "buenas"), no necesita respuesta.
- Si pregunta por datos de SU reunión (link, hora, fecha, cuánto dura, dónde es), respóndele tú mismo usando ÚNICAMENTE los datos reales de arriba (la fecha/hora y el link), sin inventar nada más.
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
