import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneKeysInText } from '../meetingLeadLink.js';

test('lee el celular escrito en el tema de una reunión cargada a mano', () => {
  assert.deepEqual(phoneKeysInText('Cliente de prueba', '51999888777 // Ing. Civil // UNCP'), ['999888777']);
  assert.deepEqual(phoneKeysInText('+51 912 345 678'), ['912345678']);
});

test('no confunde fechas ni DNI con un celular', () => {
  assert.deepEqual(phoneKeysInText('FB // Administración', 'DNI 70000000 · 25/11/2026'), []);
});
