import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuotedLabel } from '../funnelColumnService.js';

/**
 * Al generar una cotización el lead se mueve solo a la etapa de cotización.
 * La marca explícita (`funnel_columns.quoted`) manda, pero casi ningún funnel
 * la tiene puesta —se agregó después de que el equipo armara sus columnas—, y
 * sin ella el lead se quedaba donde estaba. El nombre de la columna es la
 * señal que sí existe siempre.
 */
test('isQuotedLabel reconoce la etapa de cotización por su nombre', () => {
  for (const label of ['Con cotización', 'Cotizado', 'COTIZACION ENVIADA', 'con cotizacion', 'Cotizaciones']) {
    assert.equal(isQuotedLabel(label), true, `no reconoció: "${label}"`);
  }
});

test('isQuotedLabel no confunde otras etapas', () => {
  for (const label of ['Nuevo', 'Contactado', 'En negociación', 'Ganado', 'Descartado', '', null]) {
    assert.equal(isQuotedLabel(label), false, `movería leads a: "${label}"`);
  }
});

test('isQuotedLabel descarta "sin cotizar", que es lo contrario', () => {
  assert.equal(isQuotedLabel('Sin cotizar'), false);
  assert.equal(isQuotedLabel('sin cotización'), false);
});
