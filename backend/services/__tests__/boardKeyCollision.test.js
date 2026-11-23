import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTER_COLUMNS } from '../setterFunnelColumnService.js';
import { GRADUATED_STATUSES, leadHasGraduated } from '../salesFunnelStage.js';

/**
 * Los dos tableros tienen tablas de columnas separadas, pero leen la MISMA
 * columna `leads.status`, y las etapas de fábrica del Setter Funnel reusan las
 * claves de los desenlaces del Funnel de Ventas — `ganado` entre ellas.
 *
 * El 19/11/2026 alguien borró la etapa "Ganado / Cerrado" del Setter Funnel.
 * `confirmDeleteColumn()` movía `leads.value.filter(l => l.status === colKey)`,
 * o sea la lista CRUDA, así que se llevó puestas las 17 ventas cerradas del
 * Funnel de Ventas: `ganado -> conversacion_abierta`, las 17 en el mismo
 * segundo y con sus proyectos ya abiertos. Desde ahí perdieron el sello, se
 * cayeron del tablero del closer y el bot las retomó.
 *
 * Estas pruebas fijan las dos mitades: que la colisión de claves EXISTE (no es
 * seguro deducir el tablero del texto del status) y que lo que separa los
 * leads de cada tablero es `leadHasGraduated()`, no la clave.
 */

test('las etapas de fábrica del setter reusan claves del Funnel de Ventas', () => {
  const setterKeys = DEFAULT_SETTER_COLUMNS.map((column) => column.key);
  const compartidas = GRADUATED_STATUSES.filter((status) => setterKeys.includes(status));

  // Si algún día dejan de compartirse, este test avisa: varias reglas del CRM
  // están escritas dando por hecho que una clave NO identifica al tablero.
  assert.ok(
    compartidas.includes('ganado'),
    'la etapa "Ganado / Cerrado" del setter ya no comparte clave con la etapa ganadora de Ventas'
  );
  assert.ok(compartidas.includes('cita_agendada'));
});

test('la etapa ganadora del setter es `final`, igual que la de Ventas', () => {
  // Por eso el borrado barría justo las ventas: las dos columnas se llaman
  // "Ganado", las dos están marcadas y las dos escriben el mismo status.
  const ganadoSetter = DEFAULT_SETTER_COLUMNS.find((column) => column.key === 'ganado');
  assert.ok(ganadoSetter);
  assert.equal(ganadoSetter.final, true);
});

test('lo que separa los leads de cada tablero es el sello, no la clave', () => {
  const salesStatuses = new Set([...GRADUATED_STATUSES, 'col_mtc9ogeu_kpk']);

  // Misma clave `ganado`, dos tableros distintos.
  const ventaCerrada = { status: 'ganado', sales_funnel_at: '2026-10-05 21:16:41' };
  const delSetter = { status: 'conversacion_abierta', sales_funnel_at: null };

  assert.equal(leadHasGraduated(ventaCerrada, salesStatuses), true);
  assert.equal(leadHasGraduated(delSetter, salesStatuses), false);

  /*
   * El espejo de la regla que faltaba en las dos pantallas: un tablero solo
   * mueve los leads que DIBUJA. Sobre la lista cruda, borrar una etapa del
   * setter alcanza a las ventas del closer y viceversa.
   */
  const crudos = [ventaCerrada, delSetter];
  const delTableroDelSetter = crudos.filter((lead) => !leadHasGraduated(lead, salesStatuses));
  assert.deepEqual(delTableroDelSetter, [delSetter]);
});
