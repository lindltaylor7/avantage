import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOSS_STAGES, lossStage, tallyLossStages } from '../lossStage.js';
import {
  LOST_STATUSES,
  SALES_LOST_STATUSES,
  SETTER_DISCARD_STATUSES,
  isLostStatus
} from '../salesFunnelStage.js';

/**
 * Los tres cajones de la pérdida, probados sin base de datos. Lo que se fija
 * acá es la propiedad de la que cuelga poder publicarlos sin mover ninguna
 * cifra histórica: son excluyentes y su suma es el contador de perdidos que ya
 * estaba.
 */

test('la unión de los dos conjuntos ES el contador de perdidos que ya se publicaba', () => {
  // Si alguien agrega un desenlace a uno de los dos y la unión se escribe a
  // mano, el reporte general deja de contarlo sin que nada falle a la vista.
  assert.deepEqual(
    [...LOST_STATUSES].sort(),
    [...new Set([...SETTER_DISCARD_STATUSES, ...SALES_LOST_STATUSES])].sort()
  );
});

test('la etapa Perdido del Funnel de Ventas es un cliente real que no compró', () => {
  assert.equal(lossStage({ status: 'perdido', responded: true }), 'perdido_ventas');
  // Y lo sigue siendo aunque nadie haya registrado la primera respuesta: lo
  // que define este cajón es que llegó al closer, no cómo se lo atendió.
  assert.equal(lossStage({ status: 'perdido', responded: false }), 'perdido_ventas');
});

test('el descarte del setter se parte por si alguien le contestó', () => {
  assert.equal(lossStage({ status: 'descartado', responded: false }), 'descartado_sin_respuesta');
  assert.equal(lossStage({ status: 'descartado', responded: true }), 'descartado_tras_contacto');
});

test('lo que no está perdido no cae en ningún cajón', () => {
  for (const status of ['nuevo', 'conversacion_abierta', 'cita_agendada', 'ganado', 'congelado']) {
    assert.equal(lossStage({ status, responded: true }), null, status);
  }
  assert.equal(lossStage({}), null);
  assert.equal(lossStage(), null);
});

test('los tres cajones son excluyentes y suman el total de perdidos', () => {
  const leads = [
    { status: 'descartado', responded: false },
    { status: 'descartado', responded: false },
    { status: 'descartado', responded: true },
    { status: 'perdido', responded: true },
    { status: 'ganado', responded: true },
    { status: 'cita_agendada', responded: false },
    { status: 'nuevo', responded: false }
  ];

  const tally = tallyLossStages(leads.map(lossStage));
  const total = LOSS_STAGES.reduce((acc, key) => acc + tally[key], 0);

  assert.equal(total, leads.filter((l) => isLostStatus(l.status)).length);
  assert.deepEqual(tally, {
    descartado_sin_respuesta: 2,
    descartado_tras_contacto: 1,
    perdido_ventas: 1
  });
});

test('el conteo devuelve siempre las tres claves, en cero', () => {
  // Una clave ausente se lee en la hoja como celda vacía, y una celda vacía se
  // lee como un cero que nadie puede comprobar.
  assert.deepEqual(tallyLossStages([]), {
    descartado_sin_respuesta: 0,
    descartado_tras_contacto: 0,
    perdido_ventas: 0
  });
});
