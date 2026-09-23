import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinQuietHours } from '../whatsappBotService.js';

/*
 * Franja de silencio de los seguimientos. La comprobación vive en una función
 * propia porque la fórmula depende de si la franja cruza la medianoche, y
 * escribirla a mano se rompe en silencio: con la fórmula de una sola forma
 * (`hora < fin || hora >= inicio`), una franja de 1 a 5 da "siempre en
 * silencio" y el bot dejaría de mandar seguimientos para siempre.
 */

test('franja que NO cruza la medianoche (la configurada: 01:00–05:00)', () => {
  assert.equal(isWithinQuietHours(0, 1, 5), false, 'medianoche: el bot puede escribir');
  assert.equal(isWithinQuietHours(1, 1, 5), true, 'la 1 a.m. ya es silencio');
  assert.equal(isWithinQuietHours(3, 1, 5), true);
  assert.equal(isWithinQuietHours(4, 1, 5), true);
  assert.equal(isWithinQuietHours(5, 1, 5), false, 'a las 5 vuelve a poder escribir');
  assert.equal(isWithinQuietHours(12, 1, 5), false);
  assert.equal(isWithinQuietHours(23, 1, 5), false);
});

test('franja que SÍ cruza la medianoche (21:00–08:00) sigue funcionando', () => {
  assert.equal(isWithinQuietHours(20, 21, 8), false);
  assert.equal(isWithinQuietHours(21, 21, 8), true);
  assert.equal(isWithinQuietHours(23, 21, 8), true);
  assert.equal(isWithinQuietHours(0, 21, 8), true);
  assert.equal(isWithinQuietHours(7, 21, 8), true);
  assert.equal(isWithinQuietHours(8, 21, 8), false);
});

test('la franja configurada por defecto deja hablar al bot de día', () => {
  assert.equal(isWithinQuietHours(10), false);
  assert.equal(isWithinQuietHours(22), false);
  assert.equal(isWithinQuietHours(2), true);
});
