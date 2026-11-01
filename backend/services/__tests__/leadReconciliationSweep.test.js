import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeadReconciliationSweep, dayKeyBefore, limaDayKey, limaHour } from '../leadReconciliationSweep.js';

/**
 * El barrido que recupera los leads que ninguna plataforma volvió a mandar.
 *
 * Lo que se verifica acá no es que llame a dos servicios, sino las tres reglas
 * de las que depende que no se pierda un lead: corre una vez al día, mira una
 * ventana de varios días (el día que falle, el siguiente lo cubre) y el fallo
 * de una plataforma no se lleva puesta a la otra.
 */

function fakeMeta(resultado = {}) {
  const calls = [];
  return {
    calls,
    async reconcile(options) {
      calls.push(options);
      if (resultado.throws) throw new Error(resultado.throws);
      return {
        totals: { en_meta: 10, en_crm: 8, faltantes: 2, importados: 2, adjuntados: 1, sin_anuncio: 0 },
        suscripcion: { estado: resultado.suscripcion || 'conectado' }
      };
    }
  };
}

function fakeTikTok(resultado = {}) {
  const calls = [];
  return {
    calls,
    async run(options) {
      calls.push(options);
      if (resultado.throws) throw new Error(resultado.throws);
      return {
        totals: {
          en_tiktok: 5, en_crm: 5, faltantes: 0, importados: 0,
          adjuntados: 0, completados: 3, sin_anuncio: 0
        }
      };
    }
  };
}

/** Un instante que en Lima (UTC-5) cae a la hora pedida. */
function limaAt(day, hour) {
  return new Date(`${day}T${String(hour + 5).padStart(2, '0')}:30:00.000Z`);
}

test('la hora y el día se leen en el huso de Lima', () => {
  // 03:30 UTC del 2 de noviembre son las 22:30 del 1 de noviembre en Lima.
  const date = new Date('2026-11-02T03:30:00.000Z');
  assert.equal(limaDayKey(date), '2026-11-01');
  assert.equal(limaHour(date), 22);
  assert.equal(dayKeyBefore(3, date), '2026-10-29');
});

test('no corre antes de su hora y corre una sola vez al día', async () => {
  const meta = fakeMeta();
  const sweep = new LeadReconciliationSweep({ metaReconciliation: meta, hour: 7, days: 3 });

  assert.equal(await sweep.runIfDue(limaAt('2026-11-01', 6)), null, 'todavía no es la hora');
  assert.equal(meta.calls.length, 0);

  assert.ok(await sweep.runIfDue(limaAt('2026-11-01', 7)), 'a su hora corre');
  assert.equal(meta.calls.length, 1);

  assert.equal(await sweep.runIfDue(limaAt('2026-11-01', 9)), null, 'ya corrió hoy');
  assert.equal(meta.calls.length, 1);

  assert.ok(await sweep.runIfDue(limaAt('2026-11-02', 7)), 'al día siguiente vuelve a correr');
  assert.equal(meta.calls.length, 2);
});

test('la ventana cubre varios días, así el día que falle lo cubre el siguiente', async () => {
  const meta = fakeMeta();
  const tiktok = fakeTikTok();
  const sweep = new LeadReconciliationSweep({
    metaReconciliation: meta, tiktokLeads: tiktok, hour: 7, days: 3
  });

  await sweep.run(limaAt('2026-11-01', 7));

  assert.deepEqual(meta.calls[0], { since: '2026-10-29', until: '2026-11-01', apply: true });
  // TikTok recibe la misma ventana con los nombres que usa su importación.
  assert.deepEqual(tiktok.calls[0], { from: '2026-10-29', to: '2026-11-01', apply: true });
});

test('importa y no solo reporta: un barrido que deja el informe es el mismo botón', async () => {
  const meta = fakeMeta();
  const sweep = new LeadReconciliationSweep({ metaReconciliation: meta, hour: 0 });

  await sweep.run(limaAt('2026-11-01', 8));
  assert.equal(meta.calls[0].apply, true);
});

test('el fallo de una plataforma no detiene a la otra', async () => {
  const meta = fakeMeta({ throws: 'Graph API 190: token caducado' });
  const tiktok = fakeTikTok();
  const sweep = new LeadReconciliationSweep({
    metaReconciliation: meta, tiktokLeads: tiktok, hour: 0
  });

  const resumen = await sweep.run(limaAt('2026-11-01', 8));

  assert.equal(tiktok.calls.length, 1, 'TikTok se concilió igual');
  assert.equal(resumen.meta, null);
  assert.equal(resumen.tiktok.completados, 3);
  assert.deepEqual(resumen.errores, [{ plataforma: 'meta', error: 'Graph API 190: token caducado' }]);
});

test('un fallo no deja el barrido reintentando en bucle cada diez minutos', async () => {
  const tiktok = fakeTikTok({ throws: 'permiso de Lead Generation no autorizado' });
  const sweep = new LeadReconciliationSweep({ tiktokLeads: tiktok, hour: 7 });

  await sweep.runIfDue(limaAt('2026-11-01', 7));
  await sweep.runIfDue(limaAt('2026-11-01', 7));
  await sweep.runIfDue(limaAt('2026-11-01', 8));

  assert.equal(tiktok.calls.length, 1, 'el día se marca corrido antes de empezar');
});

test('el resumen cuenta los adjuntados, que son los duplicados que explican la brecha', async () => {
  const meta = fakeMeta();
  const sweep = new LeadReconciliationSweep({ metaReconciliation: meta, hour: 0 });

  const resumen = await sweep.run(limaAt('2026-11-01', 8));

  assert.equal(resumen.meta.en_meta, 10);
  assert.equal(resumen.meta.importados, 2);
  assert.equal(resumen.meta.adjuntados, 1);
  assert.equal(resumen.dia, '2026-11-01');
});
