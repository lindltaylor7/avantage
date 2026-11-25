import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_STEPS,
  TRACE_ZONE_KEYS,
  buildTrace,
  furthestIndex,
  groupByOrigin,
  reachedSteps,
  waitingOn,
  zoneOf
} from '../leadTraceability.js';

/**
 * La cadena de trazabilidad del Reporte General: las reglas que deciden en qué
 * paso se cuenta cada lead, probadas sin base de datos.
 */

/** El contexto que el servicio arma con sus consultas, acá a mano. */
function ctx({ won = [], meetings = [], proposals = [], collected = [], graduated = [] } = {}) {
  return {
    wonIds: new Set(won),
    meetingIds: new Set(meetings),
    proposalIds: new Set(proposals),
    collectedIds: new Set(collected),
    graduated: (lead) => graduated.includes(lead.id),
    appointment: (lead) => lead.status === 'cita_agendada',
    quoting: (lead) => lead.status === 'en_negociacion'
  };
}

const entry = (reached, extra = {}) => ({ reached, lost: false, idleDays: null, ...extra });

test('la etapa que afirma la cita cuenta como cita aunque no haya reunión', () => {
  const lead = { id: 1, status: 'cita_agendada', first_response_at: '2026-10-01' };
  const reached = reachedSteps(lead, ctx({ graduated: [1] }));
  assert.equal(reached.cita, true, 'una cita sin reunión igual es una cita del tablero');
  assert.equal(reached.propuesta, false);
});

test('una reunión en la agenda cuenta como cita aunque la etapa diga otra cosa', () => {
  const lead = { id: 7, status: 'conversacion_abierta', first_response_at: '2026-10-01' };
  assert.equal(reachedSteps(lead, ctx({ meetings: [7] })).cita, true);
});

test('el paso alcanzado es el MÁS lejano y no el primero que falla', () => {
  // Un lead ganado al que nadie le registró la primera respuesta: igual pasó
  // por todos los pasos anteriores.
  const lead = { id: 2, status: 'ganado', first_response_at: null };
  const reached = reachedSteps(lead, ctx({ won: [2] }));
  assert.equal(reached.contactado, false);
  assert.equal(furthestIndex(reached), TRACE_STEPS.findIndex((s) => s.key === 'cerrado'));
});

test('el embudo nunca se ensancha hacia abajo', () => {
  const entries = [
    entry({ captado: true }),
    entry({ captado: true, contactado: true }),
    entry({ captado: true, contactado: true, ventas: true, cita: true }),
    // El ganado sin primera respuesta ni cita: el máximo lo pone igual arriba.
    entry({ captado: true, cerrado: true })
  ];
  const { steps } = buildTrace(entries);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].reached <= steps[i - 1].reached, `se ensancha en ${steps[i].key}`);
  }
  assert.equal(steps[0].reached, 4);
  assert.equal(steps[0].ofPrevious, null);
});

test('los parados y los perdidos son excluyentes: la suma cierra con el total', () => {
  const entries = [
    entry({ captado: true }),
    entry({ captado: true }, { lost: true }),
    entry({ captado: true, contactado: true }, { idleDays: 10 }),
    entry({ captado: true, contactado: true, ventas: true, cita: true, propuesta: true }),
    entry({ captado: true, contactado: true, ventas: true, cita: true, propuesta: true, cerrado: true }),
    entry({
      captado: true,
      contactado: true,
      ventas: true,
      cita: true,
      propuesta: true,
      cerrado: true,
      cobrado: true
    })
  ];
  const trace = buildTrace(entries);
  const stopped = trace.steps.reduce((sum, s) => sum + s.stuckOpen + s.lost, 0);
  assert.equal(stopped + trace.completed, trace.total, 'alguien se cuenta dos veces o ninguna');
  assert.equal(trace.completed, 1, 'solo el que llegó al final completó la cadena');
  // El lead ganado y sin cobrar está parado, no completado.
  const cerrado = trace.steps.find((s) => s.key === 'cerrado');
  assert.equal(cerrado.stuckOpen, 1);
});

test('un lead del último paso no se cuenta como parado', () => {
  const full = Object.fromEntries(TRACE_STEPS.map((s) => [s.key, true]));
  const trace = buildTrace([entry(full)]);
  assert.equal(trace.completed, 1);
  assert.equal(trace.steps.at(-1).stuckOpen, 0);
});

test('la mayor fuga es el paso donde más leads se detuvieron', () => {
  const entries = [
    ...Array.from({ length: 5 }, () => entry({ captado: true, contactado: true })),
    entry({ captado: true }),
    entry({ captado: true, contactado: true, ventas: true, cita: true })
  ];
  const { leak } = buildTrace(entries);
  assert.equal(leak.key, 'contactado');
  assert.equal(leak.stopped, 5);
  assert.equal(leak.share, 71.4);
  // Quién tiene la pelota de esos cinco: el dueño del paso que FALTA.
  assert.equal(leak.waitingOnLabel, 'Setter');
});

test('sin leads detenidos no se inventa una fuga', () => {
  const full = Object.fromEntries(TRACE_STEPS.map((s) => [s.key, true]));
  assert.equal(buildTrace([entry(full)]).leak, null);
  assert.equal(buildTrace([]).leak, null);
});

test('la mediana de días parados sale solo de los leads parados en ese paso', () => {
  const entries = [
    entry({ captado: true, contactado: true }, { idleDays: 4 }),
    entry({ captado: true, contactado: true }, { idleDays: 20 }),
    // Perdido: no está esperando a nadie, así que no corre la mediana.
    entry({ captado: true, contactado: true }, { lost: true, idleDays: 400 })
  ];
  const step = buildTrace(entries).steps.find((s) => s.key === 'contactado');
  assert.equal(step.idleDaysMedian, 12);
  assert.equal(step.lost, 1);
});

test('quien tiene la pelota es el dueño del paso que falta', () => {
  assert.equal(waitingOn(0), 'setter', 'un lead sin contactar lo espera el setter');
  const cita = TRACE_STEPS.findIndex((s) => s.key === 'cita');
  assert.equal(waitingOn(cita), 'ventas', 'con la cita hecha, cotizar es de Ventas');
  assert.equal(waitingOn(TRACE_STEPS.length - 1), null);
});

test('las columnas de una fuente reparten todos sus leads', () => {
  const entries = [
    { reached: { captado: true }, lost: false, origin: 'Meta' },
    { reached: { captado: true, contactado: true }, lost: true, origin: 'Meta' },
    {
      reached: { captado: true, contactado: true, ventas: true, cita: true, propuesta: true },
      lost: false,
      origin: 'Meta'
    },
    { reached: { captado: true, cerrado: true }, lost: false, origin: 'TikTok' }
  ];
  const rows = groupByOrigin(entries, { keyOf: (e) => e.origin, labelOf: (e) => e.origin });
  assert.deepEqual(rows.map((r) => r.label), ['Meta', 'TikTok']);
  const meta = rows[0];
  assert.equal(meta.leads, 3);
  assert.equal(
    TRACE_ZONE_KEYS.reduce((sum, key) => sum + meta.zones[key], 0),
    meta.leads,
    'el reparto de una fuente tiene que sumar sus leads'
  );
  assert.equal(meta.zones.setter, 1, 'el que nadie contestó lo espera el setter');
  assert.equal(meta.zones.ventas, 1, 'el que ya tiene propuesta lo espera Ventas');
  assert.equal(meta.zones.perdido, 1);
  assert.equal(meta.neverAnswered, 1);
  assert.equal(rows[1].wonShare, 100);
});

test('"sin contestar" de una fuente no puede contradecir la cadena', () => {
  /*
   * El caso que lo rompía: un lead ganado al que nadie le registró la primera
   * respuesta. La cadena es acumulativa y lo cuenta como contactado, así que
   * leer la marca cruda acá hacía que la misma tarjeta dijera "3 contactados"
   * arriba y "3 sin una sola respuesta" abajo.
   */
  const entries = [
    { reached: { captado: true, cerrado: true }, lost: false, origin: 'Meta' },
    { reached: { captado: true }, lost: false, origin: 'Meta' }
  ];
  const [meta] = groupByOrigin(entries, { keyOf: (e) => e.origin, labelOf: (e) => e.origin });
  assert.equal(meta.neverAnswered, 1, 'solo el que no pasó del primer paso');
  assert.ok(
    meta.neverAnswered <= meta.zones.setter,
    'la pista tiene que ser un subconjunto del tramo al que se pega'
  );
});

test('una venta cerrada cuenta como ganada aunque además esté perdida en el status', () => {
  // El caso raro: proyecto abierto y la tarjeta movida a "Perdido". El dinero
  // es el hecho más difícil de discutir, así que manda el cierre.
  assert.equal(zoneOf({ reached: { captado: true, cerrado: true }, lost: true }), 'ganado');
});
