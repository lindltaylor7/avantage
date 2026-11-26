import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YCloudBalanceAlert, isInsufficientBalanceError } from '../ycloudBalanceAlert.js';

/**
 * El 26/11/2026 el bot dejó de responderle a todo el mundo a las 10:25 porque
 * la cuenta de YCloud se quedó en 0,05 USD, y nadie se enteró hasta que
 * alguien mandó una captura: el rechazo dejaba la misma línea de log que un
 * número inválido, y el saldo llevaba 18 días bajando sin ninguna señal.
 *
 * Lo que estas pruebas fijan es lo que hace útil al aviso: que reconozca el
 * rechazo por saldo en las DOS redacciones que manda YCloud, que no confunda
 * un 403 de otra cosa con falta de dinero, que avise una vez y no en cada
 * vuelta del barrido, que una transición a peor sí interrumpa esa calma, y que
 * no se pueda leer el saldo no se trate como que no hay saldo.
 */

/** Un aviso que solo anota lo que le pidieron mandar. */
function notificadorDePrueba() {
  const enviados = [];
  const notify = async (mensaje) => { enviados.push(mensaje); };
  return { enviados, notify };
}

/** Reloj controlable: el aviso se repite por tiempo, y eso hay que poder moverlo. */
function reloj(inicio = 0) {
  let t = inicio;
  return { now: () => t, avanzar: (ms) => { t += ms; } };
}

test('reconoce el rechazo por saldo en la redacción que YCloud manda de verdad', () => {
  // La que llegó en producción: mensaje de primer nivel, sin código.
  assert.equal(
    isInsufficientBalanceError(403, { message: 'The account balance is insufficient.' }),
    true
  );
});

test('reconoce también la redacción que promete la documentación', () => {
  assert.equal(
    isInsufficientBalanceError(403, {
      error: { code: 'BALANCE_INSUFFICIENT', message: 'The account has insufficient balance. Top up before trying again.' }
    }),
    true
  );
});

test('el código manda aunque el status no sea 403', () => {
  // Si YCloud cambiara el status, el código sigue identificando el caso.
  assert.equal(isInsufficientBalanceError(402, { code: 'BALANCE_INSUFFICIENT' }), true);
});

test('un 403 que NO es por saldo no se confunde con falta de dinero', () => {
  // Recargar no arregla un destinatario restringido: tratarlo igual pausaría
  // los barridos de todos los leads por el problema de uno.
  assert.equal(
    isInsufficientBalanceError(403, { message: 'The recipient is not allowed to receive messages.' }),
    false
  );
  assert.equal(isInsufficientBalanceError(401, { message: 'Invalid API key.' }), false);
});

test('avisa una sola vez aunque rechace muchos envíos seguidos', async () => {
  const { enviados, notify } = notificadorDePrueba();
  const t = reloj();
  const alerta = new YCloudBalanceAlert({ notify, now: t.now });

  for (let i = 0; i < 25; i++) {
    await alerta.noteRejection({ reason: 'The account balance is insufficient.', waId: `5199000000${i}` });
  }

  assert.equal(enviados.length, 1);
  assert.match(enviados[0].titulo, /sin saldo/i);
  assert.equal(alerta.agotado, true);
});

test('repite el aviso recién cuando vence la ventana', async () => {
  const { enviados, notify } = notificadorDePrueba();
  const t = reloj();
  const alerta = new YCloudBalanceAlert({ notify, now: t.now, realertMs: 12 * 60 * 60 * 1000 });

  await alerta.noteRejection({ reason: 'insufficient balance' });
  t.avanzar(60 * 60 * 1000); // una hora: todavía no
  await alerta.noteRejection({ reason: 'insufficient balance' });
  assert.equal(enviados.length, 1);

  t.avanzar(12 * 60 * 60 * 1000);
  await alerta.noteRejection({ reason: 'insufficient balance' });
  assert.equal(enviados.length, 2);
});

test('el saldo bajo avisa, y quedarse en cero vuelve a avisar en el acto', async () => {
  const { enviados, notify } = notificadorDePrueba();
  const t = reloj();
  const alerta = new YCloudBalanceAlert({ notify, now: t.now, lowBalanceUsd: 20 });

  await alerta.check(async () => ({ ok: true, status: 200, amount: 8, currency: 'USD' }));
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].titulo, /bajo/i);

  // Sin esperar la ventana: de "poco saldo" a "sin saldo" hay que enterarse ya.
  await alerta.check(async () => ({ ok: true, status: 200, amount: 0, currency: 'USD' }));
  assert.equal(enviados.length, 2);
  assert.equal(alerta.agotado, true);
});

test('con saldo suficiente no avisa nada', async () => {
  const { enviados, notify } = notificadorDePrueba();
  const alerta = new YCloudBalanceAlert({ notify, lowBalanceUsd: 20 });

  await alerta.check(async () => ({ ok: true, status: 200, amount: 120, currency: 'USD' }));
  assert.equal(enviados.length, 0);
  assert.equal(alerta.agotado, false);
});

test('un envío que sale bien levanta la pausa sin reiniciar el proceso', async () => {
  const { notify } = notificadorDePrueba();
  const alerta = new YCloudBalanceAlert({ notify });

  await alerta.noteRejection({ reason: 'insufficient balance' });
  assert.equal(alerta.agotado, true);

  alerta.noteSuccess();
  assert.equal(alerta.agotado, false);
});

test('no poder LEER el saldo no es lo mismo que no tener saldo', async () => {
  const { enviados, notify } = notificadorDePrueba();
  const alerta = new YCloudBalanceAlert({ notify });

  // API key inválida: pausar los barridos acá castigaría a los leads por un
  // problema que no se arregla recargando.
  const resultado = await alerta.check(async () => ({ ok: false, status: 401, reason: 'Invalid API key.' }));

  assert.equal(alerta.agotado, false);
  assert.equal(enviados.length, 0);
  assert.equal(resultado.balance, null);
});

test('la cadencia la decide el módulo: el barrido de diez minutos no multiplica las llamadas', async () => {
  const t = reloj();
  const alerta = new YCloudBalanceAlert({ notify: async () => {}, now: t.now, checkIntervalMs: 60 * 60 * 1000 });

  let llamadas = 0;
  const leer = async () => { llamadas++; return { ok: true, status: 200, amount: 120, currency: 'USD' }; };

  await alerta.checkIfDue(leer);
  t.avanzar(10 * 60 * 1000);
  await alerta.checkIfDue(leer);
  t.avanzar(10 * 60 * 1000);
  await alerta.checkIfDue(leer);
  assert.equal(llamadas, 1);

  t.avanzar(60 * 60 * 1000);
  await alerta.checkIfDue(leer);
  assert.equal(llamadas, 2);
});
