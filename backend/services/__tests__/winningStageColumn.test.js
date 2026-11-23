import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWinningStatuses } from '../../../src/salesFunnelStage.js';

/**
 * El equipo reportó la etapa "Ganado" vacía (0 leads) mientras el resumen de
 * la misma pantalla contaba 2 proyectos ganados, y Finanzas, Campañas y
 * Proyectos seguían viendo esas ventas.
 *
 * La causa: el tablero ubica cada lead comparando su `status` contra la CLAVE
 * de la columna, y la clave de una etapa creada desde la pantalla la genera el
 * servidor (`col_mtc2nwec_fij`), mientras que el cierre de venta escribe
 * siempre `ganado`. Recrear la columna "Ganado" bastaba para que dejara de
 * recibir sus propios leads, que caían en la primera columna del tablero.
 *
 * Estas pruebas fijan la regla que lo vuelve a juntar: "venta ganada" es el
 * desenlace fijo MÁS la clave de la columna marcada como ganadora, igual que
 * `loadWinningStatuses()` en el backend.
 */

/** Las columnas tal como las arma el equipo: claves generadas, no legibles. */
const columns = [
  { key: 'col_mtc2nwec_fij', label: 'Nuevo', final: false },
  { key: 'col_mtc2oic2_0dv', label: 'En negociación', final: false },
  { key: 'col_mtc2olqj_j1e', label: 'Ganado', final: true }
];

test('la etapa ganadora recibe también los leads cerrados como "ganado"', () => {
  const winning = buildWinningStatuses(columns);
  assert.equal(winning.has('ganado'), true);
  assert.equal(winning.has('col_mtc2olqj_j1e'), true);
});

test('ninguna otra etapa cuenta como venta ganada', () => {
  const winning = buildWinningStatuses(columns);
  for (const status of ['col_mtc2nwec_fij', 'col_mtc2oic2_0dv', 'perdido', 'cita_agendada', '']) {
    assert.equal(winning.has(status), false, `contaría como ganado: "${status}"`);
  }
});

test('sin columna ganadora queda el desenlace fijo, no un conjunto vacío', () => {
  // Es el estado en el que quedó el funnel del reporte: ninguna columna con
  // la marca. Un conjunto vacío haría que ni siquiera `ganado` se reconozca.
  assert.deepEqual(buildWinningStatuses([]), new Set(['ganado']));
  assert.deepEqual(buildWinningStatuses(), new Set(['ganado']));
});
