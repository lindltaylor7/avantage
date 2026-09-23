import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeGarbageValue } from '../whatsappBotService.js';
import { normalizeUniversity } from '../universityNormalizer.js';

/*
 * Datos del lead mal procesados. Casos reales que llegaron al contacto:
 *   "Perfecto: Yy", "Perfecto: Upc", "¡Hola, La!" (el perfil se llamaba
 *   "La Vida Continua"), "Villareal" → San Marcos, "UNAC" → U. del Centro.
 */

test('un valor sin sentido no se toma como dato', () => {
  for (const v of ['Yy', 'aa', 'xd', 'yyyy', '...', '123', '', '   ']) {
    assert.equal(looksLikeGarbageValue(v), true, `"${v}" debería descartarse`);
  }
});

test('un dato real sí se toma', () => {
  for (const v of ['Upc', 'UNSAAC', 'Ingeniería ambiental', 'San Marcos', 'derecho']) {
    assert.equal(looksLikeGarbageValue(v), false, `"${v}" es un dato válido`);
  }
});

// El catálogo cerrado es lo que impide que una sigla se confunda con otra.
test('las siglas peruanas se resuelven contra el catálogo, no a ojo', async () => {
  const unac = await normalizeUniversity('UNAC');
  assert.equal(unac.name, 'Universidad Nacional del Callao');
  assert.equal(unac.confidence, 'alta');

  const villarreal = await normalizeUniversity('Villarreal');
  assert.equal(villarreal.name, 'Universidad Nacional Federico Villarreal');

  const upc = await normalizeUniversity('Upc');
  assert.equal(upc.name, 'Universidad Peruana de Ciencias Aplicadas');

  const untels = await normalizeUniversity('UNTELS');
  assert.equal(untels.name, 'Universidad Nacional Tecnológica de Lima Sur');
});

test('lo que el catálogo no reconoce se deja tal cual, con confianza baja', async () => {
  const unknown = await normalizeUniversity('San pedro chimbote');
  assert.equal(unknown.confidence, 'baja');
  assert.equal(unknown.name, 'San pedro chimbote', 'no se inventa una corrección');
});
