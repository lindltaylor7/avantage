import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMonthKey, previousMonthKey } from '../reportPeriod.js';

const now = new Date(2026, 10, 25);

test('normalizeMonthKey acepta un mes pasado o el actual', () => {
  assert.equal(normalizeMonthKey('2026-10', now), '2026-10');
  assert.equal(normalizeMonthKey('2026-11', now), '2026-11');
});

test('normalizeMonthKey rechaza meses futuros y basura', () => {
  assert.equal(normalizeMonthKey('2026-12', now), null);
  assert.equal(normalizeMonthKey('2026-13', now), null);
  assert.equal(normalizeMonthKey('octubre', now), null);
  assert.equal(normalizeMonthKey(undefined, now), null);
});

test('previousMonthKey cruza el año', () => {
  assert.equal(previousMonthKey('2026-01'), '2025-12');
  assert.equal(previousMonthKey('2026-11'), '2026-10');
});
