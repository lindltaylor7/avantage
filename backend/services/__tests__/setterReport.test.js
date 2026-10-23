import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributedSetterId,
  classifyLead,
  daysBetween,
  median,
  summarize,
  topStages,
  withRates
} from '../setterReportService.js';

/**
 * Reporte de Setters: las reglas que deciden a quién se le cuenta cada lead y
 * cómo quedó, probadas sin base de datos.
 */

const CTX = {
  wonStatuses: new Set(['ganado', 'col_final_abc']),
  salesStatuses: new Set(['cita_agendada', 'en_negociacion', 'ganado', 'perdido']),
  projectIds: new Set(),
  meetingsByLead: new Map()
};

const conCtx = (extra = {}) => ({ ...CTX, ...extra });

test('el lead se atribuye al setter sellado antes que al responsable actual', () => {
  // Es el caso que importa: al ganar, la ficha ya está a nombre del closer.
  assert.equal(attributedSetterId({ setter_user_id: 7, assigned_user_id: 3 }), 7);
  // Sin sello todavía (no graduó), manda quien lo está trabajando.
  assert.equal(attributedSetterId({ setter_user_id: null, assigned_user_id: 3 }), 3);
  assert.equal(attributedSetterId({ setter_user_id: null, assigned_user_id: null }), null);
  assert.equal(attributedSetterId(null), null);
});

test('daysBetween: una reunión anterior a la ficha es "el mismo día", no un dato roto', () => {
  assert.equal(daysBetween('2026-10-01T10:00:00Z', '2026-10-04T10:00:00Z'), 3);
  assert.equal(daysBetween('2026-10-04T10:00:00Z', '2026-10-01T10:00:00Z'), 0);
  assert.equal(daysBetween(null, '2026-10-01T10:00:00Z'), null);
  assert.equal(daysBetween('2026-10-01T10:00:00Z', 'cualquier cosa'), null);
});

test('median aguanta el caso raro que corre un promedio', () => {
  assert.equal(median([1, 2, 300]), 2);
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([null, undefined, NaN]), null);
});

test('una venta ganada se reconoce por su status o por tener proyecto abierto', () => {
  const porStatus = classifyLead({ id: 1, status: 'ganado' }, CTX);
  assert.equal(porStatus.won, true);

  // La columna configurada como `final`: su clave la genera el equipo.
  assert.equal(classifyLead({ id: 2, status: 'col_final_abc' }, CTX).won, true);

  // El respaldo: alguien recreó la columna sin marcarla `final`, pero el
  // proyecto sigue abierto.
  const porProyecto = classifyLead(
    { id: 3, status: 'col_nueva_sin_marcar' },
    conCtx({ projectIds: new Set([3]) })
  );
  assert.equal(porProyecto.won, true);
});

test('una venta marcada como no concretada no cuenta como ganada', () => {
  const verdict = classifyLead(
    { id: 4, status: 'ganado', deal_cancelled_at: '2026-10-10 09:00:00' },
    conCtx({ projectIds: new Set([4]) })
  );
  assert.equal(verdict.won, false);
  // Y tampoco se cuenta como perdida: el lead no se perdió, la venta se cayó.
  assert.equal(verdict.lost, false);
});

test('los dos desenlaces de pérdida cuentan, uno por tablero', () => {
  assert.equal(classifyLead({ id: 5, status: 'perdido' }, CTX).lost, true);
  assert.equal(classifyLead({ id: 6, status: 'descartado' }, CTX).lost, true);
  assert.equal(classifyLead({ id: 7, status: 'calificando' }, CTX).lost, false);
});

test('la graduación se recuerda por el sello, no por el texto del status', () => {
  // Status que ya no es columna de nadie, pero el sello está puesto.
  const sellado = classifyLead(
    { id: 8, status: 'col_borrada', sales_funnel_at: '2026-10-02 11:00:00' },
    CTX
  );
  assert.equal(sellado.graduated, true);
  assert.equal(classifyLead({ id: 9, status: 'calificando' }, CTX).graduated, false);
});

/** Un lote de leads listo para `summarize()`, con su clasificación hecha. */
function entrada(lead, extra = {}) {
  const ctx = conCtx(extra.ctx || {});
  const verdict = classifyLead(lead, ctx);
  verdict.wonAt = verdict.won ? extra.wonAt || null : null;
  return { lead, verdict, movedAt: extra.movedAt || null };
}

test('summarize: ganado, en proceso y perdido suman siempre el total de leads', () => {
  const reuniones = new Map([
    [1, { active: 1, cancelled: 0, manual: 1, firstBookedAt: '2026-10-03T10:00:00Z' }],
    [2, { active: 0, cancelled: 1, manual: 0, firstBookedAt: '2026-10-05T10:00:00Z' }]
  ]);
  const ctx = { meetingsByLead: reuniones };

  const stats = summarize([
    entrada(
      { id: 1, status: 'ganado', created_at: '2026-10-01T10:00:00Z', sales_funnel_at: '2026-10-02 10:00:00' },
      { ctx, wonAt: '2026-10-11T10:00:00Z', movedAt: '2026-10-11 10:00:00' }
    ),
    entrada({ id: 2, status: 'cita_agendada', created_at: '2026-10-01T10:00:00Z' }, { ctx, movedAt: '2026-10-05 10:00:00' }),
    entrada({ id: 3, status: 'perdido', created_at: '2026-10-02T10:00:00Z' }, { ctx }),
    entrada({ id: 4, status: 'calificando', created_at: '2026-10-02T10:00:00Z' }, { ctx })
  ]);

  assert.equal(stats.leads, 4);
  assert.equal(stats.won, 1);
  assert.equal(stats.lost, 1);
  assert.equal(stats.open, 2);
  // La barra de composición se dibuja con estos tres: si no suman el total,
  // la barra miente.
  assert.equal(stats.won + stats.open + stats.lost, stats.leads);
  // De los dos en proceso, uno ya es del closer y el otro sigue en el setter.
  assert.equal(stats.openSales, 1);
  assert.equal(stats.openSetter, 1);
  // El lead 1 ganó Y tuvo reunión: es el numerador de "cierre por reunión".
  assert.equal(stats.wonWithMeeting, 1);
  assert.equal(stats.meetingToWinRate, 100);
});

test('summarize: una reunión cancelada no es una reunión conseguida', () => {
  const ctx = {
    meetingsByLead: new Map([
      [1, { active: 1, cancelled: 2, manual: 0, firstBookedAt: '2026-10-03T10:00:00Z' }],
      [2, { active: 0, cancelled: 1, manual: 0, firstBookedAt: '2026-10-04T10:00:00Z' }]
    ])
  };

  const stats = summarize([
    entrada({ id: 1, status: 'cita_agendada', created_at: '2026-10-01T10:00:00Z' }, { ctx }),
    entrada({ id: 2, status: 'calificando', created_at: '2026-10-01T10:00:00Z' }, { ctx })
  ]);

  // Solo el lead 1 tiene una reunión en pie.
  assert.equal(stats.withMeeting, 1);
  assert.equal(stats.meetings, 1);
  assert.equal(stats.meetingsCancelled, 3);
  assert.equal(stats.meetingRate, 50);
  // La mediana solo mira a los que de verdad consiguieron reunión.
  assert.equal(stats.daysToMeeting, 2);
});

test('summarize cuenta los leads que nadie movió nunca', () => {
  const ctx = { meetingsByLead: new Map() };
  const stats = summarize([
    entrada({ id: 1, status: 'nuevo', created_at: '2026-10-01T10:00:00Z' }, { ctx }),
    entrada({ id: 2, status: 'nuevo', created_at: '2026-10-01T10:00:00Z' }, { ctx, movedAt: '2026-10-02 10:00:00' })
  ]);
  assert.equal(stats.unmoved, 1);
});

test('sin leads, ninguna tasa inventa un cero', () => {
  const stats = summarize([]);
  assert.equal(stats.leads, 0);
  assert.equal(stats.meetingRate, null);
  assert.equal(stats.winRate, null);
  assert.equal(stats.daysToMeeting, null);
});

test('el cierre por reunión no existe cuando no hubo reuniones', () => {
  const sinReunion = withRates({ leads: 10, withMeeting: 0, won: 2, wonWithMeeting: 0, graduated: 3, lost: 1 });
  assert.equal(sinReunion.meetingToWinRate, null);
  assert.equal(sinReunion.winRate, 20);

  const conReunion = withRates({ leads: 10, withMeeting: 4, won: 2, wonWithMeeting: 2, graduated: 3, lost: 1 });
  assert.equal(conReunion.meetingToWinRate, 50);
  assert.equal(conReunion.meetingRate, 40);
});

test('el cierre por reunión nunca pasa del 100% aunque se cierre sin reunión', () => {
  /*
   * El caso que apareció al correr el reporte contra la base: 4 ventas, pero
   * solo 2 leads con reunión agendada (las otras dos se cerraron sin reunión
   * cargada). Con el total de ganados arriba, la tasa decía "200%".
   */
  const stats = withRates({ leads: 10, withMeeting: 2, won: 4, wonWithMeeting: 1, graduated: 7, lost: 2 });
  assert.equal(stats.meetingToWinRate, 50);
  assert.ok(stats.meetingToWinRate <= 100);
});

test('topStages agrupa la cola en vez de dibujar una barra por etapa', () => {
  const etapas = new Map();
  for (let i = 1; i <= 9; i++) {
    etapas.set(`setter:e${i}`, { status: `e${i}`, label: `Etapa ${i}`, count: i, board: 'setter' });
  }

  const todas = topStages(etapas, 6);
  assert.equal(todas.length, 7);
  assert.equal(todas[0].count, 9); // la más poblada primero
  const otras = todas.at(-1);
  assert.equal(otras.isOther, true);
  assert.equal(otras.label, 'Otras 3 etapas');
  // En singular no se dice "Otras 1 etapas".
  assert.equal(topStages(etapas, 8).at(-1).label, 'Otra etapa');
  assert.equal(otras.count, 1 + 2 + 3);
  // Ningún lead se pierde en el recorte: es lo que sostiene el total de la fila.
  assert.equal(todas.reduce((t, e) => t + e.count, 0), 45);

  // Con pocas etapas no se agrupa nada.
  assert.equal(topStages(etapas, 20).length, 9);
});
