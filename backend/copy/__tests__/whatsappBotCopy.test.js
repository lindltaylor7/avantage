import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceAnchor, priceInsistedHandoff, priceInsistedDuringScheduling } from '../whatsappBotCopy.js';

// El precio se reserva: priceAnchor nunca debe mencionar un monto o rango en
// soles, solo aclarar que depende del caso y poner el foco en agendar la
// reunión (gratuita) con el asesor.
test('priceAnchor no menciona montos y aclara que la reunión es gratis', () => {
  const text = priceAnchor(null);
  assert.doesNotMatch(text, /S\/\d/);
  assert.doesNotMatch(text, /\d{3,}/);
  assert.match(text, /gratis/i);
  assert.match(text, /20 min/);
});

test('priceAnchor saluda por nombre solo cuando se pasa un contactName', () => {
  const withName = priceAnchor('Frank');
  const withoutName = priceAnchor(null);
  assert.match(withName, /Frank/);
  assert.doesNotMatch(withoutName, /¡Hola/);
});

// F1 — Principio de diseño: nunca repetir la misma evasiva dos veces. Los
// tres mensajes que puede recibir un lead que insiste con el precio (1º
// ancla, 2º handoff en conversación libre, 2º/3º handoff durante el
// agendamiento) deben ser todos distintos entre sí.
test('los tres mensajes de precio son todos distintos entre sí (nunca se repite la misma evasiva)', () => {
  const anchor = priceAnchor(null);
  const handoff = priceInsistedHandoff();
  const schedulingHandoff = priceInsistedDuringScheduling();

  assert.notEqual(anchor, handoff);
  assert.notEqual(anchor, schedulingHandoff);
  assert.notEqual(handoff, schedulingHandoff);
});

test('priceAnchor es estable: mismo contactName produce siempre el mismo texto (no lo redacta el LLM)', () => {
  assert.equal(priceAnchor('Ana'), priceAnchor('Ana'));
});
