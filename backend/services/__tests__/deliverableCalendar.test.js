import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventBodyFor,
  eventDescriptionFor,
  eventTitleFor,
  nextDay,
  planFor,
  signatureFor
} from '../deliverableCalendarService.js';

/**
 * El volcado del calendario de Entregables a una cuenta de Google.
 *
 * Lo que se prueba es lo que se puede decidir sin hablar con Google: qué se
 * crea, qué se actualiza, qué se quita y con qué forma viaja cada entrega. La
 * llamada a la API no se prueba acá —hace falta una cuenta— pero sí todo lo
 * que decide cuántas llamadas se hacen y qué dicen.
 */

const entrega = (extra = {}) => ({
  id: 1,
  title: 'Plan de tesis',
  description: null,
  due_date: '2026-11-20',
  status: 'pendiente',
  delivered_at: null,
  delivered_by_name: null,
  topic: 'Gestión de inventarios',
  client_name: 'Cielo Padilla',
  income_code: 'ING-0042',
  google_event_id: null,
  google_signature: null,
  ...extra
});

/* ─────────────────────────── Qué hacer con cada una ─────────────────────── */

test('una entrega con fecha y sin evento se crea', () => {
  assert.equal(planFor(entrega()), 'crear');
});

test('una entrega que no cambió no se vuelve a mandar', () => {
  // 44 entregas son 44 llamadas a Google; las que están igual que ayer no
  // tienen por qué gastar una, y así el botón apretado dos veces no hace nada.
  const fila = entrega({ google_event_id: 'abc' });
  assert.equal(planFor({ ...fila, google_signature: signatureFor(fila) }), 'nada');
});

test('si cambió la fecha, el título o el estado, se actualiza', () => {
  const original = entrega({ google_event_id: 'abc' });
  const firma = signatureFor(original);

  for (const cambio of [
    { due_date: '2026-11-27' },
    { title: 'Plan de tesis (corregido)' },
    { status: 'entregado', delivered_at: '2026-11-21' },
    { client_name: 'Otra persona' }
  ]) {
    const fila = { ...original, ...cambio, google_signature: firma };
    assert.equal(planFor(fila), 'actualizar', `no detectó el cambio: ${JSON.stringify(cambio)}`);
  }
});

test('una entrega que se quedó sin fecha se quita del calendario', () => {
  // El calendario es el plan: una entrega sin día pactado no tiene dónde ir, y
  // dejarla en Google la muestra en una fecha que ya no es la acordada.
  assert.equal(planFor(entrega({ due_date: null, google_event_id: 'abc' })), 'quitar');
});

test('una entrega sin fecha que nunca se mandó no hace nada', () => {
  assert.equal(planFor(entrega({ due_date: null })), 'nada');
});

/* ──────────────────────────── Cómo viaja cada una ───────────────────────── */

test('el evento es de día completo y termina al día siguiente', () => {
  // En Google el fin de un evento de día completo es EXCLUSIVO: con el mismo
  // día en los dos extremos, el evento no se dibuja.
  const body = eventBodyFor(entrega());
  assert.deepEqual(body.start, { date: '2026-11-20' });
  assert.deepEqual(body.end, { date: '2026-11-21' });
});

test('el día siguiente se calcula en UTC, así no lo corre el huso', () => {
  assert.equal(nextDay('2026-11-30'), '2026-12-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.equal(nextDay('2028-02-28'), '2028-02-29');
});

test('el evento no manda invitaciones ni recordatorios', () => {
  // Son 44 entregas: el calendario se mira, no notifica.
  const body = eventBodyFor(entrega());
  assert.deepEqual(body.reminders, { useDefault: false, overrides: [] });
  assert.equal(body.transparency, 'transparent');
});

test('el título lleva al cliente, y la entregada va marcada', () => {
  assert.equal(eventTitleFor(entrega()), '📦 Plan de tesis · Cielo Padilla');
  assert.equal(
    eventTitleFor(entrega({ status: 'entregado' })),
    '✅ Plan de tesis · Cielo Padilla'
  );
});

test('sin cliente, el título es la entrega a secas y no "undefined"', () => {
  assert.equal(eventTitleFor(entrega({ client_name: null })), '📦 Plan de tesis');
});

test('la cuota se nombra por su código y nunca viaja un importe', () => {
  // Misma regla que el resto del módulo: el dinero se consulta en Finanzas.
  const texto = eventDescriptionFor(entrega({ description: 'Capítulo I y II' }));
  assert.match(texto, /ING-0042/);
  assert.doesNotMatch(texto, /S\/|\d+[.,]\d{2}/);
});

test('la descripción avisa que lo editado en Google se pierde', () => {
  // El volcado es de ida: sin el aviso, alguien corrige la fecha en Google y
  // la próxima sincronización se la pisa sin explicación.
  assert.match(eventDescriptionFor(entrega()), /se pierde en la próxima sincronización/);
});

test('la firma cambia con el contenido y no con cosas que no se mandan', () => {
  const base = entrega();
  assert.equal(signatureFor(base), signatureFor({ ...base, id: 99, google_event_id: 'x' }));
  assert.notEqual(signatureFor(base), signatureFor({ ...base, due_date: '2026-12-01' }));
});
