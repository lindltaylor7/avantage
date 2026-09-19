import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MetaAdsService } from '../metaAdsService.js';

/**
 * El estado de la integración se muestra como un banner verde/rojo en la vista
 * de Campañas, y de él depende que el botón de sincronizar esté habilitado. Si
 * dice "conectado" sin haber comprobado el token, el usuario ve un banner
 * verde y un error de sincronización a la vez — que es justo lo que pasaba
 * cuando la cuenta venía de META_ADS_ACCOUNT_ID: esa rama no tocaba el Graph.
 */

const ENV_KEYS = ['META_ADS_ACCESS_TOKEN', 'META_PAGE_ACCESS_TOKEN', 'META_ADS_ACCOUNT_ID'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.META_ADS_ACCESS_TOKEN = 'token-de-prueba';
  process.env.META_ADS_ACCOUNT_ID = '1625910892246042';
  delete process.env.META_PAGE_ACCESS_TOKEN;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** fetch simulado que responde lo mismo a cualquier URL. */
function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    return { ok, status, async json() { return payload; } };
  };
  impl.calls = calls;
  return impl;
}

test('el token caducado se reporta como invalid_token, no como "conectado"', async () => {
  // Respuesta literal de Meta cuando el usuario cerró sesión en Facebook.
  const fetchImpl = fakeFetch({
    error: {
      message: 'Error validating access token: The session is invalid because the user logged out.',
      type: 'OAuthException',
      code: 190,
      error_subcode: 467
    }
  }, { ok: false, status: 400 });

  const status = await new MetaAdsService({ fetchImpl }).status();

  assert.equal(status.configured, false, 'no puede darse por configurado con el token muerto');
  assert.equal(status.reason, 'invalid_token');
  assert.equal(status.metaCode, 190);
  assert.match(status.error, /session is invalid/);
});

test('con META_ADS_ACCOUNT_ID igual se comprueba el token contra el Graph', async () => {
  const fetchImpl = fakeFetch({
    id: 'act_1625910892246042', name: 'Tesis Perú', account_status: 1, currency: 'PEN'
  });

  const status = await new MetaAdsService({ fetchImpl }).status();

  assert.equal(fetchImpl.calls.length, 1, 'debe haber una llamada de validación');
  assert.match(fetchImpl.calls[0], /act_1625910892246042/);
  assert.equal(status.configured, true);
  assert.equal(status.accountName, 'Tesis Perú');
  assert.equal(status.accountCurrency, 'PEN');
  assert.equal(status.accountDisabled, false);
});

test('una cuenta publicitaria inactiva se marca aunque el token sirva', async () => {
  const fetchImpl = fakeFetch({
    id: 'act_1625910892246042', name: 'Tesis Perú', account_status: 2, currency: 'PEN'
  });

  const status = await new MetaAdsService({ fetchImpl }).status();

  assert.equal(status.configured, true, 'el token es válido: la integración está configurada');
  assert.equal(status.accountDisabled, true);
});

test('sin token no se llama al Graph', async () => {
  delete process.env.META_ADS_ACCESS_TOKEN;
  const fetchImpl = fakeFetch({});

  const status = await new MetaAdsService({ fetchImpl }).status();

  assert.equal(status.configured, false);
  assert.equal(status.reason, 'no_token');
  assert.equal(status.hasToken, false);
  assert.equal(fetchImpl.calls.length, 0);
});

test('un error distinto de 190 conserva su propia causa', async () => {
  delete process.env.META_ADS_ACCOUNT_ID; // fuerza el descubrimiento por /me/adaccounts
  const fetchImpl = fakeFetch({ data: [] });

  const status = await new MetaAdsService({ fetchImpl }).status();

  assert.equal(status.configured, false);
  assert.equal(status.reason, 'no_ad_account');
  assert.match(status.error, /ads_read/);
});
