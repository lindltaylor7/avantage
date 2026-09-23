import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticalSignal, detectLeadSignals, saysNotInterested } from '../leadSignals.js';

test('detecta el plantón en la reunión en las formas en que se dice de verdad', () => {
  for (const text of [
    'Estuve esperando en el meet y nadie entró',
    'nadie se conectó a la reunión',
    'el asesor no entró',
    'me dejaron plantado',
    'quedé esperando media hora',
    'la sala estaba vacía',
    'no había nadie en el meet'
  ]) {
    assert.equal(criticalSignal(text), 'noShow', `no detectó el plantón en: "${text}"`);
  }
});

test('detecta quejas sobre el servicio, con y sin tilde', () => {
  for (const text of [
    'quiero poner una queja',
    'esto es un reclamo formal',
    'pésimo servicio',
    'pesimo servicio',
    'me estafaron',
    'esto es una estafa',
    'quiero mi reembolso',
    'estoy muy molesta con el trabajo'
  ]) {
    assert.equal(criticalSignal(text), 'complaint', `no detectó la queja en: "${text}"`);
  }
});

test('detecta el pedido explícito de hablar con una persona', () => {
  for (const text of [
    'quiero hablar con alguien',
    'quiero hablar con un asesor',
    'pásame con una persona',
    'necesito hablar con un humano',
    'no quiero hablar con un bot',
    'apaga tu bot',
    'quiero atención humana',
    'me atiende una persona real?'
  ]) {
    assert.equal(criticalSignal(text), 'humanRequest', `no detectó el pedido en: "${text}"`);
  }
});

test('detecta la frustración con el propio bot (se repite / no entiende)', () => {
  for (const text of [
    'ya te dije mi carrera',
    'ya te dije que estoy en cero',
    'no me entiendes',
    'no me estás escuchando',
    'me estás preguntando lo mismo',
    'siempre repites lo mismo',
    'no entiendes nada'
  ]) {
    assert.equal(criticalSignal(text), 'frustration', `no detectó la frustración en: "${text}"`);
  }
});

// Lo más importante de este módulo no es lo que detecta, sino lo que NO
// detecta: un falso positivo saca al lead del flujo automático y lo deja
// esperando a una persona que quizá tarde horas en escribirle.
test('NO escala mensajes normales de la conversación', () => {
  for (const text of [
    'Hola',
    'quiero información',
    '¿cuánto cuesta?',
    'Estoy en cero, no tengo tema',
    'Soy de Derecho de la UNMSM',
    'mañana a las 3 pm',
    'ok gracias',
    'ya pues, dale'
  ]) {
    assert.equal(criticalSignal(text), null, `escaló de más en: "${text}"`);
  }
});

// Estos dos son los falsos positivos concretos que motivaron acotar las
// expresiones: "no me sirve" es la forma normal de rechazar un horario, y
// "asesor" es vocabulario del propio bot.
test('NO escala "ese horario no me sirve" (es una respuesta de agendamiento)', () => {
  assert.equal(criticalSignal('ese horario no me sirve'), null);
  assert.equal(criticalSignal('no me sirve la tarde'), null);
});

test('NO escala una pregunta sobre el asesor que no pide hablar con uno', () => {
  assert.equal(criticalSignal('¿la reunión es para hablar con un asesor?'), null);
  assert.equal(criticalSignal('el asesor me va a explicar el precio?'), null);
});

// Un mensaje real trae varias señales a la vez; gana la más específica y la
// que más pesa emocionalmente: la disculpa por el plantón, no el acuse de
// "te paso con un asesor".
test('con varias señales a la vez, prioriza el plantón sobre el pedido de persona', () => {
  const text = 'Estuve esperando y nadie entró, quiero hablar con alguien';
  const signals = detectLeadSignals(text);

  assert.equal(signals.noShow, true);
  assert.equal(signals.humanRequest, true);
  assert.equal(criticalSignal(text), 'noShow');
});

test('detectLeadSignals devuelve todas las banderas en false para un mensaje normal', () => {
  assert.deepEqual(detectLeadSignals('Soy de Contabilidad, San Marcos'), {
    noShow: false, complaint: false, humanRequest: false, frustration: false
  });
});

/**
 * Caso real del 22/09: el lead escribió "Ya no estoy interesado, gracias", el
 * bot se despidió bien… y una hora después el barrido de inactividad le mandó
 * "¿Sigues por ahí?". La señal existe para cerrar la sesión y que eso no pase.
 */
test('saysNotInterested reconoce una despedida', () => {
  for (const text of [
    'Ya no estoy interesado, gracias',
    'no me interesa',
    'ya no quiero',
    'ya consegui a alguien',
    'ya contrate a otra persona',
    'ya no deseo continuar con el servicio'
  ]) {
    assert.equal(saysNotInterested(text), true, `no reconoció la despedida en: "${text}"`);
  }
});

test('saysNotInterested no confunde una preferencia con un adiós', () => {
  for (const text of [
    'no me interesa el horario de la tarde',
    'no me interesa el precio ahora, quiero saber que incluye',
    'no puedo ahora',
    'no me llames, prefiero Meet',
    'quiero saber el precio',
    '1'
  ]) {
    assert.equal(saysNotInterested(text), false, `cerró la conversación de más en: "${text}"`);
  }
});
