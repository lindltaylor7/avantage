import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadFormFields, detectRedundantAsk, daysMatchingPreferredTime } from '../whatsappBotService.js';

// Mensaje real (anonimizado) de un lead de Meta Ads con formulario propio:
// llega como líneas "¿Pregunta?: Respuesta" que el LLM de conversación a
// veces no extrae por estar enfocado en redactar el saludo de apertura.
const META_AD_FORM_MESSAGE = `¡Hola! Completé el formulario y me gustaría obtener más información sobre tu negocio.

¿Qué estás sacando?: Título profesional
¿En qué universidad estudias o estudiaste?: San pedro chimbote
Full name: Carlos Fernando Rodriguez Luna
Phone number: +51949491790
¿En qué punto estás?: Todavía no empiezo`;

test('extractLeadFormFields lee nivel y universidad del formulario de Meta Ads', () => {
  const fields = extractLeadFormFields(META_AD_FORM_MESSAGE);
  assert.equal(fields.level, 'Pregrado (Bachiller/Título)');
  assert.equal(fields.university, 'San pedro chimbote');
});

test('extractLeadFormFields ignora "Full name" y "Phone number" (no son carrera/universidad/nivel)', () => {
  const fields = extractLeadFormFields(META_AD_FORM_MESSAGE);
  assert.equal(fields.field, undefined);
});

test('extractLeadFormFields reconoce maestría y doctorado', () => {
  assert.equal(extractLeadFormFields('¿Qué estás sacando?: Maestría').level, 'Posgrado (Maestría)');
  assert.equal(extractLeadFormFields('¿Qué estás sacando?: Doctorado').level, 'Posgrado (Doctorado)');
});

test('extractLeadFormFields devuelve objeto vacío para un mensaje conversacional normal', () => {
  const fields = extractLeadFormFields('Hola, quisiera saber cuánto cuesta la asesoría');
  assert.deepEqual(fields, {});
});

test('extractLeadFormFields no confunde una frase con dos puntos con un campo del formulario', () => {
  const fields = extractLeadFormFields('Te cuento: no tengo tema todavía');
  assert.deepEqual(fields, {});
});

// Caso real: el formulario de Meta Ads responde la pregunta de avance con
// "Todavía no empiezo" — la misma señal que el prompt del LLM ya trata como
// "sin tema, empieza de cero" cuando la persona lo escribe a mano en el chat.
test('extractLeadFormFields lee "sin tema" de la pregunta de avance del formulario', () => {
  const fields = extractLeadFormFields(META_AD_FORM_MESSAGE);
  assert.equal(fields.problem, 'Sin tema definido (desde cero)');
});

test('extractLeadFormFields no marca "sin tema" cuando la persona SÍ tiene avance', () => {
  const fields = extractLeadFormFields('¿En qué punto estás?: Ya tengo avance, voy por el capítulo 2');
  assert.equal(fields.problem, undefined);
});

// F1/F4 — Red de seguridad: si el tema ya se dio por resuelto (sea porque la
// persona lo dijo o porque el formulario ya lo insinuó), un mensaje del LLM
// que vuelve a preguntar por el tema se detecta como redundante — salvo en
// el primer turno, cuyo saludo de apertura pregunta por el tema siempre, por
// diseño, y no debe perderse.
test('detectRedundantAsk detecta que se repite la pregunta por el tema (turnos después del primero)', () => {
  const answers = { problem: 'Sin tema definido (desde cero)' };
  assert.equal(detectRedundantAsk('¿Ya tienes un tema en mente para tu tesis?', answers, false), 'problem');
});

test('detectRedundantAsk NO marca redundante la pregunta por el tema en el primer turno', () => {
  const answers = { problem: 'Sin tema definido (desde cero)' };
  assert.equal(detectRedundantAsk('¡Hola, Mario! ¿Ya tienes un tema en mente para tu tesis?', answers, true), null);
});

// --- Responder solo con una hora ("3:30") a la propuesta de días ---------
// Caso real: se le ofreció "hoy de 3:30 p.m. a 6:00 p.m. y el jueves 17...",
// respondió "3:30" y el bot contestó "No identifiqué el día", pidiéndole
// repetir lo que acababa de decir. El día sale de la agenda, y el primero de
// la lista es el que se agenda: quien contesta "3:30" a un "hoy de 3:30 a 6"
// está diciendo hoy. Lima es UTC-5 todo el año, así que 20:30Z = 3:30 p.m.
const slotAt = (date, iso) => ({ date, startTime: iso });

test('daysMatchingPreferredTime deduce el día cuando la hora solo está libre en uno', () => {
  const slots = [
    slotAt('2026-09-16', '2026-09-16T20:30:00.000Z'), // hoy 3:30 p.m.
    slotAt('2026-09-17', '2026-09-17T14:30:00.000Z')  // jueves 9:30 a.m.
  ];
  assert.deepEqual(daysMatchingPreferredTime(slots, '15:30'), ['2026-09-16']);
});

test('daysMatchingPreferredTime devuelve los días en orden: el más próximo primero', () => {
  const slots = [
    slotAt('2026-09-17', '2026-09-17T20:30:00.000Z'),
    slotAt('2026-09-16', '2026-09-16T20:30:00.000Z')
  ];
  // Los dos tienen las 3:30 libres; se agenda el primero, o sea hoy.
  assert.deepEqual(daysMatchingPreferredTime(slots, '15:30'), ['2026-09-16', '2026-09-17']);
});

test('daysMatchingPreferredTime no calza una hora que no está libre en ningún día', () => {
  const slots = [slotAt('2026-09-16', '2026-09-16T20:30:00.000Z')];
  assert.deepEqual(daysMatchingPreferredTime(slots, '11:00'), []);
});

// Una hora inferida de un "en la tarde" (~15:00) no es suya: no se le exige
// un bloque idéntico, basta que el día tenga algo alrededor.
test('daysMatchingPreferredTime acepta lo cercano cuando la hora la dedujo el parser', () => {
  const slots = [
    slotAt('2026-09-16', '2026-09-16T21:00:00.000Z'), // 4:00 p.m.
    slotAt('2026-09-17', '2026-09-17T14:30:00.000Z')  // 9:30 a.m.
  ];
  assert.deepEqual(daysMatchingPreferredTime(slots, '15:00', 'vague'), ['2026-09-16']);
  assert.deepEqual(daysMatchingPreferredTime(slots, '15:00', 'exact'), []);
});
