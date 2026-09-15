import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadFormFields, detectRedundantAsk } from '../whatsappBotService.js';

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
