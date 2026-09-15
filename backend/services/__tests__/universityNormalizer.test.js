import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUniversity } from '../universityNormalizer.js';

// Casos reales del audit de conversaciones (8-15 sep): el LLM de resolución
// confirmó universidades equivocadas con confianza falsa. normalizeUniversity()
// debe resolverlos SIN llamar al LLM, porque están en el catálogo cerrado.

test('"Villarreal" resuelve a UNFV sin depender del LLM (bug real: se confirmaba como San Marcos)', async () => {
  const resolved = await normalizeUniversity('Villarreal', {
    resolveWithLLM: async () => { throw new Error('no debería llamarse: el catálogo ya lo reconoce'); }
  });
  assert.equal(resolved.name, 'Universidad Nacional Federico Villarreal');
  assert.equal(resolved.confidence, 'alta');
  assert.equal(resolved.source, 'catalogo');
});

test('"UNAC" resuelve a Universidad Nacional del Callao, no a la del Centro (bug real: UNCP)', async () => {
  const resolved = await normalizeUniversity('UNAC', {
    resolveWithLLM: async () => { throw new Error('no debería llamarse: el catálogo ya lo reconoce'); }
  });
  assert.equal(resolved.name, 'Universidad Nacional del Callao');
  assert.equal(resolved.confidence, 'alta');
});

test('no confunde "UNAC" con "UNCP" por substring parcial', async () => {
  const unac = await normalizeUniversity('unac');
  const uncp = await normalizeUniversity('uncp');
  assert.notEqual(unac.name, uncp.name);
  assert.equal(uncp.name, 'Universidad Nacional del Centro del Perú');
});

test('un alias corto ambiguo no matchea dentro de otra palabra (evita falsos positivos)', async () => {
  // "uni" es alias de la Universidad Nacional de Ingeniería, pero no debería
  // "reconocer" la palabra "universidad" ni "continental" como si contuvieran esa sigla.
  const resolved = await normalizeUniversity('estudio en una universidad privada, todavía no sé cuál', {
    resolveWithLLM: async () => ({ name: null, confident: false })
  });
  assert.notEqual(resolved.name, 'Universidad Nacional de Ingeniería');
});

test('sin match en el catálogo y sin resolveWithLLM: confianza baja, texto tal cual', async () => {
  const resolved = await normalizeUniversity('una universidad rarísima que no existe');
  assert.equal(resolved.confidence, 'baja');
  assert.equal(resolved.name, 'una universidad rarísima que no existe');
});

test('el LLM dice "confident: true" pero su respuesta no calza con el catálogo: baja a confianza media', async () => {
  const resolved = await normalizeUniversity('una sigla rara', {
    resolveWithLLM: async () => ({ name: 'Universidad Inventada que no Existe', confident: true })
  });
  assert.equal(resolved.confidence, 'media');
  assert.equal(resolved.source, 'llm_sin_catalogo');
});

test('el LLM resuelve correcto y su respuesta SÍ calza con el catálogo: confianza alta validada', async () => {
  const resolved = await normalizeUniversity('una sigla rara que el catálogo no tiene', {
    resolveWithLLM: async () => ({ name: 'Universidad Nacional Mayor de San Marcos', confident: true })
  });
  assert.equal(resolved.confidence, 'alta');
  assert.equal(resolved.source, 'llm_validado');
  assert.equal(resolved.name, 'Universidad Nacional Mayor de San Marcos');
});

test('el LLM dice "confident: false": se queda con el texto tal cual, sin mencionar universidad', async () => {
  const resolved = await normalizeUniversity('UNA', {
    resolveWithLLM: async () => ({ name: 'UNA', confident: false })
  });
  assert.equal(resolved.confidence, 'baja');
  assert.equal(resolved.name, 'UNA');
});

// Banco de regresión F4: 20 siglas peruanas comunes deben resolver sin LLM.
const commonAliases = [
  ['UNMSM', 'Universidad Nacional Mayor de San Marcos'],
  ['UNI', 'Universidad Nacional de Ingeniería'],
  ['UNAC', 'Universidad Nacional del Callao'],
  ['UNFV', 'Universidad Nacional Federico Villarreal'],
  ['UNCP', 'Universidad Nacional del Centro del Perú'],
  ['UCV', 'Universidad César Vallejo'],
  ['UTP', 'Universidad Tecnológica del Perú'],
  ['USMP', 'Universidad de San Martín de Porres'],
  ['UNSAAC', 'Universidad Nacional de San Antonio Abad del Cusco'],
  ['UPC', 'Universidad Peruana de Ciencias Aplicadas'],
  ['PUCP', 'Pontificia Universidad Católica del Perú'],
  ['UNTELS', 'Universidad Nacional Tecnológica de Lima Sur'],
  ['UCH', 'Universidad de Ciencias y Humanidades'],
  ['continental', 'Universidad Continental'],
  ['upla', 'Universidad Peruana Los Andes'],
  ['undac', 'Universidad Nacional Daniel Alcides Carrión'],
  ['unsa', 'Universidad Nacional de San Agustín'],
  ['ulima', 'Universidad de Lima'],
  ['usil', 'Universidad San Ignacio de Loyola'],
  ['esan', 'Universidad ESAN']
];

for (const [alias, expectedName] of commonAliases) {
  test(`sigla común "${alias}" resuelve determinísticamente a "${expectedName}"`, async () => {
    const resolved = await normalizeUniversity(alias, {
      resolveWithLLM: async () => { throw new Error('no debería llamarse: el catálogo ya lo reconoce'); }
    });
    assert.equal(resolved.name, expectedName);
    assert.equal(resolved.confidence, 'alta');
  });
}
