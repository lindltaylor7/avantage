import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceAnchor, priceInsistedHandoff, priceInsistedDuringScheduling } from '../whatsappBotCopy.js';

const settings = {
  price_pregrado_min: 3000, price_pregrado_max: 6000,
  price_maestria_min: 6000, price_maestria_max: 10000,
  price_doctorado_min: 10000, price_doctorado_max: 15000
};

test('priceAnchor incluye los tres rangos reales y aclara que la reunión es gratis', () => {
  const text = priceAnchor(settings, null);
  assert.match(text, /S\/3,000 - S\/6,000/);
  assert.match(text, /S\/6,000 - S\/10,000/);
  assert.match(text, /S\/10,000 - S\/15,000/);
  assert.match(text, /gratis/i);
  assert.match(text, /20 min/);
});

test('priceAnchor saluda por nombre solo cuando se pasa un contactName', () => {
  const withName = priceAnchor(settings, 'Frank');
  const withoutName = priceAnchor(settings, null);
  assert.match(withName, /Frank/);
  assert.doesNotMatch(withoutName, /¡Hola/);
});

// F1 — Principio de diseño: nunca repetir la misma evasiva dos veces. Los
// tres mensajes que puede recibir un lead que insiste con el precio (1º
// ancla, 2º handoff en conversación libre, 2º/3º handoff durante el
// agendamiento) deben ser todos distintos entre sí.
test('los tres mensajes de precio son todos distintos entre sí (nunca se repite la misma evasiva)', () => {
  const anchor = priceAnchor(settings, null);
  const handoff = priceInsistedHandoff();
  const schedulingHandoff = priceInsistedDuringScheduling();

  assert.notEqual(anchor, handoff);
  assert.notEqual(anchor, schedulingHandoff);
  assert.notEqual(handoff, schedulingHandoff);
});

test('priceAnchor es estable: mismos settings producen siempre el mismo texto (no lo redacta el LLM)', () => {
  assert.equal(priceAnchor(settings, 'Ana'), priceAnchor(settings, 'Ana'));
});
