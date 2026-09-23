import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCareer } from '../careerNormalizer.js';
import { sanitizeMeetLink } from '../googleCalendarService.js';

/**
 * Casos tomados del formulario real de Meta del 22/09: así llegaban las
 * carreras, y así se las repetía el bot en su primer mensaje.
 */
test('normalizeCareer arregla la escritura del formulario', () => {
  assert.equal(normalizeCareer('ing mecanica electrica'), 'Ingeniería Mecánica Eléctrica');
  assert.equal(normalizeCareer('administracion'), 'Administración');
  assert.equal(normalizeCareer('Educacion'), 'Educación');
  assert.equal(normalizeCareer('educación inicial'), 'Educación Inicial');
  assert.equal(normalizeCareer('ing. de sistemas'), 'Ingeniería de Sistemas');
});

test('normalizeCareer deja en minúscula los conectores', () => {
  assert.equal(normalizeCareer('ciencias de la comunicacion'), 'Ciencias de la Comunicación');
  assert.equal(normalizeCareer('educacion para el trabajo'), 'Educación para el Trabajo');
});

test('normalizeCareer no toca lo que ya viene bien escrito', () => {
  // Elegida de un select del panel: cambiarla sería peor que dejarla.
  assert.equal(normalizeCareer('Ingeniería de Sistemas y Computación'), 'Ingeniería de Sistemas y Computación');
  assert.equal(normalizeCareer('Derecho'), 'Derecho');
  assert.equal(normalizeCareer('  '), '');
  assert.equal(normalizeCareer(null), '');
});

test('normalizeCareer conserva las siglas en mayúsculas', () => {
  assert.equal(normalizeCareer('tsp'), 'TSP');
  assert.equal(normalizeCareer('ing de sistemas con ia'), 'Ingeniería de Sistemas con IA');
});

test('sanitizeMeetLink quita el authuser que rompe el ingreso del cliente', () => {
  assert.equal(
    sanitizeMeetLink('https://meet.google.com/wry-zkdh-yar?authuser=0'),
    'https://meet.google.com/wry-zkdh-yar'
  );
  assert.equal(
    sanitizeMeetLink('https://meet.google.com/abc-defg-hij#success'),
    'https://meet.google.com/abc-defg-hij'
  );
  assert.equal(sanitizeMeetLink('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(sanitizeMeetLink(''), null);
  assert.equal(sanitizeMeetLink(null), null);
});
