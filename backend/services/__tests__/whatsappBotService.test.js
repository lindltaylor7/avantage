import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLeadFormFields } from '../whatsappBotService.js';

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
