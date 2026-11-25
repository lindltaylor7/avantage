import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INCOME_CLASS_KEYS,
  classifyIncomeRow,
  compareSchedule,
  firstInstallmentIds,
  splitIncome
} from '../incomeSplit.js';

/**
 * El reparto de la caja entre el primer pago (Ventas) y las cuotas siguientes
 * (académico y gestión), probado sin base de datos.
 */

test('el orden del cronograma es vencimiento, fecha, id', () => {
  const rows = [
    { id: 3, due_date: '2026-03-10', fecha: null },
    { id: 1, due_date: '2026-01-10', fecha: null },
    { id: 2, due_date: '2026-02-10', fecha: null }
  ];
  assert.deepEqual([...rows].sort(compareSchedule).map((r) => r.id), [1, 2, 3]);
});

test('sin vencimiento va PRIMERO, como ordena MySQL', () => {
  // De ese orden salió el marcador `is_initial_payment` de los cierres que lo
  // tienen; ponerlo al final haría que lo derivado lo contradijera.
  const rows = [
    { id: 2, due_date: '2026-01-10', fecha: '2026-01-10' },
    { id: 1, due_date: null, fecha: '2026-05-01' }
  ];
  assert.deepEqual([...rows].sort(compareSchedule).map((r) => r.id), [1, 2]);
});

test('con el mismo vencimiento desempata la fecha y después el id', () => {
  const rows = [
    { id: 9, due_date: '2026-01-10', fecha: '2026-01-15' },
    { id: 8, due_date: '2026-01-10', fecha: '2026-01-11' }
  ];
  assert.deepEqual([...rows].sort(compareSchedule).map((r) => r.id), [8, 9]);
  const empate = [
    { id: 20, due_date: '2026-01-10', fecha: '2026-01-10' },
    { id: 4, due_date: '2026-01-10', fecha: '2026-01-10' }
  ];
  assert.deepEqual([...empate].sort(compareSchedule).map((r) => r.id), [4, 20]);
});

test('entiende las fechas como Date, que es lo que devuelve mysql2', () => {
  const rows = [
    { id: 2, due_date: new Date(2026, 4, 1), fecha: null },
    { id: 1, due_date: new Date(2026, 0, 1), fecha: null }
  ];
  assert.deepEqual([...rows].sort(compareSchedule).map((r) => r.id), [1, 2]);
});

test('hay un solo primer pago por lead', () => {
  const schedule = [
    { id: 1, lead_id: 10, due_date: '2026-01-10' },
    { id: 2, lead_id: 10, due_date: '2026-02-10' },
    { id: 3, lead_id: 10, due_date: '2026-03-10' },
    { id: 4, lead_id: 20, due_date: '2026-02-01' },
    { id: 5, lead_id: 20, due_date: '2026-01-01' }
  ];
  const firstIds = firstInstallmentIds(schedule);
  assert.deepEqual([...firstIds].sort((a, b) => a - b), [1, 5]);
});

test('el lead que pagó todo de una vez es primer pago', () => {
  const firstIds = firstInstallmentIds([{ id: 1, lead_id: 10, due_date: '2026-01-10' }]);
  assert.equal(classifyIncomeRow({ id: 1, lead_id: 10 }, firstIds), 'primer_pago');
});

test('lo derivado coincide con el marcador `is_initial_payment` donde existe', () => {
  /*
   * Es LA propiedad del módulo: la clase se deriva en vez de leer la columna
   * —el marcador solo está puesto en los cierres posteriores al flujo que lo
   * creó— pero donde la columna existe las dos respuestas tienen que ser la
   * misma, o Finanzas y este reporte dirían cosas distintas del mismo cierre.
   */
  const schedule = [
    { id: 1, lead_id: 10, due_date: null, fecha: '2026-02-01', is_initial_payment: true },
    { id: 2, lead_id: 10, due_date: '2026-01-10', fecha: '2026-01-10', is_initial_payment: false },
    { id: 3, lead_id: 11, due_date: '2026-04-10', fecha: null, is_initial_payment: false },
    { id: 4, lead_id: 11, due_date: '2026-03-10', fecha: null, is_initial_payment: true }
  ];
  const firstIds = firstInstallmentIds(schedule);
  for (const row of schedule) {
    assert.equal(
      firstIds.has(row.id),
      row.is_initial_payment,
      `la cuota ${row.id} no coincide con su marcador`
    );
  }
});

test('una cuota sin lead no se reparte por descarte: tiene su propia clase', () => {
  assert.equal(classifyIncomeRow({ id: 99, lead_id: null }, new Set()), 'sin_cliente');
});

test('el reparto suma el total y calcula los porcentajes', () => {
  const schedule = [
    { id: 1, lead_id: 10, due_date: '2026-01-10' },
    { id: 2, lead_id: 10, due_date: '2026-02-10' },
    { id: 3, lead_id: 20, due_date: '2026-01-05' }
  ];
  const firstIds = firstInstallmentIds(schedule);
  const cobrado = [
    { id: 1, lead_id: 10, monto: 600 },
    { id: 2, lead_id: 10, monto: 200 },
    { id: 3, lead_id: 20, monto: 150 },
    { id: 99, lead_id: null, monto: 50 }
  ];
  const split = splitIncome(cobrado, firstIds);
  assert.equal(split.total, 1000);
  const byKey = Object.fromEntries(split.classes.map((c) => [c.key, c]));
  assert.deepEqual(split.classes.map((c) => c.key), INCOME_CLASS_KEYS);
  assert.equal(byKey.primer_pago.amount, 750);
  assert.equal(byKey.primer_pago.share, 75);
  assert.equal(byKey.primer_pago.leads, 2);
  assert.equal(byKey.siguientes.amount, 200);
  assert.equal(byKey.siguientes.share, 20);
  assert.equal(byKey.sin_cliente.amount, 50);
  // Los porcentajes se reparten entre las tres clases y nada más.
  assert.equal(split.classes.reduce((sum, c) => sum + c.share, 0), 100);
});

test('sin nada cobrado el porcentaje es null y no 0', () => {
  const split = splitIncome([], new Set());
  assert.equal(split.total, 0);
  for (const clase of split.classes) assert.equal(clase.share, null);
});

test('el área a la que se atribuye cada clase viaja con ella', () => {
  const split = splitIncome([], new Set());
  const byKey = Object.fromEntries(split.classes.map((c) => [c.key, c]));
  assert.equal(byKey.primer_pago.owner, 'Ventas');
  assert.equal(byKey.siguientes.owner, 'Académico y gestión');
});
