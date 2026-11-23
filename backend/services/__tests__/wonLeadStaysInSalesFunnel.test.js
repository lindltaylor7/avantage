import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadHasGraduated, SETTER_ONLY_STATUSES } from '../salesFunnelStage.js';

/**
 * 19 proyectos abiertos cuyo lead no estaba en NINGUNA etapa del Funnel de
 * Ventas (reporte del 23/11/2026): ninguno decía ya `ganado` y todos habían
 * terminado en una etapa del Setter Funnel (`conversacion_abierta`,
 * `descartado`, `calificando`).
 *
 * La cadena que lo produce tiene tres eslabones, y el primero es legítimo:
 *
 *   1. Una PERSONA devuelve el lead a una etapa del setter. `updateLeadStatus()`
 *      le borraba el sello `sales_funnel_at`, que es lo correcto para un lead
 *      que de verdad vuelve a calificarse.
 *   2. Sin sello y con una etapa del setter, `leadHasGraduated()` dice que no,
 *      así que el tope que impide que el bot lo mueva deja de aplicarle.
 *   3. El bot lo retoma y lo sigue moviendo, con el proyecto del cliente ya
 *      abierto; el tablero del closer no lo dibuja y la etapa ganadora queda
 *      en 0 mientras Finanzas y Proyectos lo siguen contando como venta.
 *
 * Estas pruebas fijan el corte: el eslabón 1 no se aplica a una venta cerrada.
 * El criterio es el PROYECTO abierto y no la etapa, porque la etapa la mueven
 * el bot y los automatismos y el proyecto no — es el mismo con el que
 * `isWonLead()` cuenta una venta en Campañas.
 */

const salesStatuses = new Set(['cita_agendada', 'en_negociacion', 'ganado', 'perdido', 'col_mtc9ogeu_kpk']);

/**
 * El espejo de la condición de `updateLeadStatus()`: a quién se le borra el
 * sello al devolverlo a una etapa del setter.
 */
function clearsSeal({ lead, actorType, toStatus, wonSale }) {
  return Boolean(lead.sales_funnel_at) && actorType === 'user' && SETTER_ONLY_STATUSES.includes(toStatus) && !wonSale;
}

test('a una venta cerrada no se le borra el sello al devolverla al setter', () => {
  const lead = { status: 'ganado', sales_funnel_at: '2026-10-01 10:00:00' };
  assert.equal(
    clearsSeal({ lead, actorType: 'user', toStatus: 'descartado', wonSale: true }),
    false
  );
});

test('a un lead sin venta cerrada sí: devolverlo al setter es una decisión válida', () => {
  const lead = { status: 'cita_agendada', sales_funnel_at: '2026-10-01 10:00:00' };
  assert.equal(
    clearsSeal({ lead, actorType: 'user', toStatus: 'descartado', wonSale: false }),
    true
  );
});

test('conservar el sello es lo que mantiene al bot fuera del lead ganado', () => {
  // Es el eslabón 2: con el sello puesto, el lead sigue siendo del closer
  // aunque su etapa diga "conversacion_abierta", así que `moveFunnelStage()`
  // y el tope de `updateLeadStatus()` lo frenan.
  const conSello = { status: 'conversacion_abierta', sales_funnel_at: '2026-10-01 10:00:00' };
  const sinSello = { status: 'conversacion_abierta', sales_funnel_at: null };

  assert.equal(leadHasGraduated(conSello, salesStatuses), true);
  assert.equal(leadHasGraduated(sinSello, salesStatuses), false, 'así es como el bot lo retomaba');
});

test('el tope del bot alcanza a la venta cerrada aunque ya haya perdido el sello', () => {
  /*
   * El espejo de la condición nueva de `updateLeadStatus()`. Cubre el daño ya
   * hecho: los 19 leads que hoy están sin sello y en una etapa del setter
   * siguen teniendo su proyecto abierto, así que el bot no puede moverlos
   * aunque nadie les devuelva el sello a mano.
   */
  const blocks = ({ graduated, wonSale, staysCommercial, actorType }) =>
    (graduated || wonSale) && !staysCommercial && actorType !== 'user';

  const lead = { status: 'conversacion_abierta', sales_funnel_at: null };
  const graduated = leadHasGraduated(lead, salesStatuses);

  assert.equal(graduated, false);
  assert.equal(
    blocks({ graduated, wonSale: true, staysCommercial: false, actorType: 'bot' }),
    true,
    'el bot seguiría moviendo una venta cerrada'
  );
  // Una persona sí puede moverlo: el tope es para los automatismos.
  assert.equal(
    blocks({ graduated, wonSale: true, staysCommercial: false, actorType: 'user' }),
    false
  );
});
