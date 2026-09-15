import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaService } from '../ollamaService.js';

// fallbackParseSchedulingDate es la rama SIN IA de parseSchedulingDate (se usa
// cuando la llamada a Ollama Cloud falla o no hay API key configurada). Caso
// real: un lead pidió "otro día en las tardes" mientras elegía horario y,
// como esta rama solo reconocía horas exactas ("6pm", "18:30"), no reconocía
// "tardes" como nada — el bot terminaba repitiendo la MISMA lista de
// horarios de la mañana con un "no te entendí" que en realidad sí había
// entendido, solo no lo estaba buscando.
const ollama = new OllamaService();
const TODAY = '2026-09-15';

test('fallbackParseSchedulingDate reconoce "en las tardes" como las 15:00, sin fecha', () => {
  const result = ollama.fallbackParseSchedulingDate('No habría otro día en las tardes', TODAY);
  assert.equal(result.date, null);
  assert.equal(result.preferredTime, '15:00');
  assert.equal(result.timePrecision, 'vague');
  assert.equal(result.declined, false);
});

test('fallbackParseSchedulingDate reconoce "por la tarde" en singular', () => {
  assert.equal(ollama.fallbackParseSchedulingDate('mejor por la tarde', TODAY).preferredTime, '15:00');
});

test('fallbackParseSchedulingDate reconoce "de noche" como las 20:00', () => {
  const result = ollama.fallbackParseSchedulingDate('tienes algo de noche?', TODAY);
  assert.equal(result.preferredTime, '20:00');
});

test('fallbackParseSchedulingDate reconoce "temprano" y "en la mañana" como las 09:00', () => {
  assert.equal(ollama.fallbackParseSchedulingDate('prefiero temprano', TODAY).preferredTime, '09:00');
  assert.equal(ollama.fallbackParseSchedulingDate('algo en la mañana?', TODAY).preferredTime, '09:00');
});

test('fallbackParseSchedulingDate prioriza una hora exacta sobre un momento del día si ambos aparecen', () => {
  const result = ollama.fallbackParseSchedulingDate('mejor en la tarde, a las 3pm', TODAY);
  assert.equal(result.preferredTime, '15:00');
  assert.equal(result.timePrecision, 'exact');
});

test('fallbackParseSchedulingDate sigue combinando "mañana" (día) con "hoy" y horas exactas como antes', () => {
  const [y, m, d] = TODAY.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  assert.equal(ollama.fallbackParseSchedulingDate('mañana a las 10', TODAY).date, tomorrow);
  assert.equal(ollama.fallbackParseSchedulingDate('hoy a las 6pm', TODAY).date, TODAY);
});
