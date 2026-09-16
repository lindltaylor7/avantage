import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coalesceTimeFragments } from '../messageFragments.js';

test('pega el meridiano que vino en una burbuja aparte', () => {
  assert.equal(coalesceTimeFragments('las 9\npm'), 'las 9 pm');
  assert.equal(coalesceTimeFragments('a las 9:30\nam'), 'a las 9:30 am');
});

test('funciona con las formas en que la gente escribe el meridiano', () => {
  assert.equal(coalesceTimeFragments('a las 6\nPm'), 'a las 6 Pm');
  assert.equal(coalesceTimeFragments('a las 6\np.m.'), 'a las 6 p.m.');
  assert.equal(coalesceTimeFragments('a las 6\nP.M'), 'a las 6 P.M');
});

// El caso real que motivó el módulo: el lead explica su horario laboral en
// una burbuja y manda el meridiano en la siguiente. Sin esto, "9" se lee
// como las 9 a.m. — dentro del horario en el que acaba de decir que trabaja.
test('conserva el contexto del renglón al pegar el meridiano', () => {
  const buffered = 'Trabajo hasta las 4:30\nme desocupo a las 9\nPm';
  assert.equal(coalesceTimeFragments(buffered), 'Trabajo hasta las 4:30\nme desocupo a las 9 Pm');
});

// Lo importante es lo que NO hace: inventar una hora donde no la hay.
test('NO pega el meridiano si el renglón anterior no termina en una hora', () => {
  assert.equal(coalesceTimeFragments('hola\npm'), 'hola\npm');
  assert.equal(coalesceTimeFragments('mañana\nam'), 'mañana\nam');
});

test('NO toca un renglón que además del meridiano dice otra cosa', () => {
  assert.equal(coalesceTimeFragments('las 9\npm mejor'), 'las 9\npm mejor');
  assert.equal(coalesceTimeFragments('las 9\nya pm'), 'las 9\nya pm');
});

test('deja igual un mensaje de una sola burbuja', () => {
  assert.equal(coalesceTimeFragments('mañana a las 3 pm'), 'mañana a las 3 pm');
  assert.equal(coalesceTimeFragments('Soy de Derecho'), 'Soy de Derecho');
});

test('no rompe un mensaje vacío ni uno sin saltos de línea', () => {
  assert.equal(coalesceTimeFragments(''), '');
  assert.equal(coalesceTimeFragments(null), '');
  assert.equal(coalesceTimeFragments('pm'), 'pm');
});
