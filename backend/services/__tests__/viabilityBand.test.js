import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIABILITY_BANDS, tallyViabilityBands, viabilityBand } from '../viabilityBand.js';

/**
 * La banda de viabilidad es texto LIBRE en la base, así que lo que se fija acá
 * es que se lea por contenido y que "nadie la registró" no se confunda con una
 * banda baja.
 */

test('la banda se reconoce aunque venga con adornos o en mayúsculas', () => {
  assert.equal(viabilityBand('Alta'), 'alta');
  assert.equal(viabilityBand('ALTA'), 'alta');
  assert.equal(viabilityBand('  Viabilidad alta  '), 'alta');
  assert.equal(viabilityBand('Media'), 'media');
  assert.equal(viabilityBand('viabilidad BAJA'), 'baja');
});

test('sin banda registrada devuelve null, que no es una cuarta banda', () => {
  // Contarlo como "baja" diría que el anuncio trae leads malos cuando lo que
  // pasa es que a ese lead nadie lo evaluó.
  for (const valor of [null, undefined, '', '   ', 0, 42, {}, 'pendiente']) {
    assert.equal(viabilityBand(valor), null, String(valor));
  }
});

test('las tres bandas y el sin registrar suman el total de leads', () => {
  const niveles = ['Alta', 'alta', 'Media', null, 'Baja', 'otra cosa'];
  const tally = tallyViabilityBands(niveles.map(viabilityBand));
  const total = [...VIABILITY_BANDS, 'sinRegistrar'].reduce((acc, k) => acc + tally[k], 0);

  assert.equal(total, niveles.length);
  assert.deepEqual(tally, { alta: 2, media: 1, baja: 1, sinRegistrar: 2 });
});
