import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

import { CampaignExportService, LEAD_TRAIL_SCHEMA_VERSION } from '../campaignExportService.js';

/**
 * La hoja "Ruta de leads" es un **contrato con marketing**: su importador busca
 * las columnas por el nombre del encabezado, así que renombrar una la deja
 * fuera del reporte sin que nada falle a la vista.
 *
 * Lo que fijan estas pruebas es lo que el contrato tiene que poder contestar
 * sin salir de la hoja: de qué plataforma salió cada lead, **con qué evidencia
 * se lo supo**, cuándo se lo concilió, si tiene atribución de más de una
 * plataforma, y con qué versión del esquema se generó el archivo. Y la
 * distinción que estaba colapsada: cobrado CERO no es cobrado DESCONOCIDO.
 */

/** Una hoja a filas de objetos, indexadas por el nombre del encabezado. */
function readSheet(sheet) {
  const headers = sheet.getRow(1).values.slice(1);
  const rows = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const values = row.values.slice(1);
    rows.push(Object.fromEntries(headers.map((h, k) => [h, values[k]])));
  });
  return rows;
}

async function buildTrail(leadTrail) {
  const service = new CampaignExportService({
    campaignService: {
      async getPerformance() {
        return { campaigns: [], leadTrail };
      }
    }
  });

  const { workbook, filename } = await service.buildWorkbook({});
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ruta-leads-')), filename);
  await workbook.xlsx.writeFile(file);

  const leido = new ExcelJS.Workbook();
  await leido.xlsx.readFile(file);
  return readSheet(leido.getWorksheet('Ruta de leads'));
}

/** Un lead de formulario de TikTok, atribuido por el id que emitió TikTok. */
function tiktokLead(extra = {}) {
  return {
    leadId: 1,
    name: 'Lucía Quispe',
    phone: '987654321',
    origin: 'Formulario',
    channel: 'Formulario',
    platform: 'TikTok',
    network: 'TikTok',
    paid: true,
    campaignId: '1790000000000000001',
    campaignName: 'TT | WA | Asesor | 27Oct',
    adsetId: '1795000000000000001',
    adsetName: 'Huancayo 22-35',
    adName: 'Video — asesoría de tesis',
    adSourceId: '1800000000000000001',
    platformLeadId: '7412',
    attributionMethod: 'platform_lead_id',
    attributionConfidence: 'alta',
    attributionReconciledAt: '2026-10-31T12:00:00.000Z',
    attributionConflict: false,
    secondaryPlatforms: null,
    enteredAt: '2026-10-27T15:30:00.000Z',
    funnelColumn: 'Conversación abierta',
    commercialStage: 'Seguimiento',
    paidRevenue: 0,
    billedRevenue: 0,
    quotedValue: null,
    ...extra
  };
}

// ───────── La viabilidad y el desenlace de la pérdida, por lead ─────────

test('la banda de viabilidad viaja por lead, al lado del puntaje', async () => {
  const [fila] = await buildTrail([tiktokLead({ viability: 78, viabilityBand: 'alta' })]);

  assert.equal(fila['Viabilidad'], 78);
  // Son dos columnas distintas de la ficha: el puntaje que calcula el
  // evaluador y la banda con la que el equipo filtra su tablero. La hoja
  // publicaba solo la primera, y promediada por anuncio.
  assert.equal(fila['Nivel de viabilidad'], 'Alta');
});

test('sin banda registrada se ESCRIBE "Sin registrar", no se deja la celda vacía', async () => {
  const [fila] = await buildTrail([tiktokLead({ viability: null, viabilityBand: null })]);

  /*
   * La celda vacía la leyó el importador de marketing como un "No" y la
   * planilla terminó diciendo que los 450 leads del corte estaban
   * descalificados. Acá sería peor: se leería como viabilidad baja, o sea como
   * un anuncio que trae leads malos, cuando lo que pasa es que nadie los
   * evaluó. Un valor que no se puede colapsar no se colapsa.
   */
  assert.equal(fila['Nivel de viabilidad'], 'Sin registrar');
});

test('el desenlace de la pérdida se nombra en castellano y distingue los dos tableros', async () => {
  const [sinRespuesta] = await buildTrail([tiktokLead({ lossStage: 'descartado_sin_respuesta' })]);
  const trasContacto = await buildTrail([tiktokLead({ lossStage: 'descartado_tras_contacto' })]);
  const enVentas = await buildTrail([tiktokLead({ lossStage: 'perdido_ventas' })]);

  /*
   * Los tres estaban colapsados en un solo contador, y de esa diferencia
   * depende qué se corrige: al contacto que nunca llegó a ser oportunidad se
   * le revisa el anuncio, al cliente real que no compró se le revisa el
   * cierre.
   */
  assert.equal(sinRespuesta['Desenlace de la pérdida'], 'Descartado sin respuesta');
  assert.equal(trasContacto[0]['Desenlace de la pérdida'], 'Descartado tras contacto');
  assert.equal(enVentas[0]['Desenlace de la pérdida'], 'Perdido en ventas');
});

test('un lead que no se perdió no tiene desenlace, y la hoja lo dice con "-"', async () => {
  const [fila] = await buildTrail([tiktokLead({ lossStage: null })]);

  // `-` es "no corresponde" y no "falta el dato": este lead sigue abierto.
  assert.equal(fila['Desenlace de la pérdida'], '-');
});

// ───────────────────── La fuente de la atribución viaja ─────────────────────

test('la hoja publica con qué evidencia se atribuyó cada lead', async () => {
  const [fila] = await buildTrail([tiktokLead()]);

  assert.equal(fila['Plataforma'], 'TikTok');
  // Sin esto la hoja afirma una plataforma y no deja comprobar cómo se llegó a
  // ella, que es lo que hacía imposible auditar los leads atribuidos por
  // coincidencia de teléfono.
  assert.equal(fila['Fuente de atribución'], 'ID del lead en la plataforma');
  assert.equal(fila['Confianza de atribución'], 'alta');
  assert.ok(fila['Conciliado'] instanceof Date);
});

test('la fuente de atribución se nombra en castellano y no con la clave interna', async () => {
  const [fila] = await buildTrail([tiktokLead({
    attributionMethod: 'phone_match',
    attributionConfidence: 'baja'
  })]);

  assert.equal(fila['Fuente de atribución'], 'Coincidencia de teléfono');
  assert.equal(fila['Confianza de atribución'], 'baja');
});

test('un lead orgánico no tiene fuente de atribución que publicar, y la hoja lo dice con "-"', async () => {
  const [fila] = await buildTrail([tiktokLead({
    platform: 'Orgánico',
    paid: false,
    attributionMethod: null,
    attributionConfidence: null,
    attributionReconciledAt: null,
    campaignId: null,
    adSourceId: null
  })]);

  // Las dos convenciones de la hoja: `-` es "acá no hay nada que poner".
  assert.equal(fila['Fuente de atribución'], '-');
  assert.equal(fila['Confianza de atribución'], '-');
});

test('un lead PAGADO sin fuente de atribución se marca "sin dato", que es lo que marketing va a buscar', async () => {
  const [fila] = await buildTrail([tiktokLead({
    attributionMethod: null,
    attributionConfidence: null
  })]);

  assert.equal(fila['Fuente de atribución'], 'sin dato');
  assert.equal(fila['Confianza de atribución'], 'sin dato');
});

// ─────────────────── La ficha con dos plataformas se ve ─────────────────────

test('la plataforma secundaria sale en la hoja: es la lista de lo que hay que revisar', async () => {
  const [fila] = await buildTrail([tiktokLead({
    platform: 'Meta',
    attributionConflict: true,
    secondaryPlatforms: 'TikTok'
  })]);

  // El origen es el sellado; lo que llegó después no lo reemplaza pero tampoco
  // se esconde — escondido, nadie lo revisa.
  assert.equal(fila['Plataforma'], 'Meta');
  assert.equal(fila['Plataforma secundaria'], 'TikTok');
});

test('sin segunda plataforma la celda dice "-" y no queda vacía', async () => {
  const [fila] = await buildTrail([tiktokLead()]);
  assert.equal(fila['Plataforma secundaria'], '-');
});

// ───────────────────────── La versión del esquema ───────────────────────────

test('cada fila lleva la versión del esquema con la que se generó', async () => {
  const [fila] = await buildTrail([tiktokLead()]);

  // Va por fila y no en una celda al margen: una fila copiada a otra
  // herramienta tiene que poder decir sola con qué esquema se generó.
  assert.equal(fila['Versión del esquema'], LEAD_TRAIL_SCHEMA_VERSION);
  assert.equal(typeof fila['Versión del esquema'], 'number');
});

// ──────────────── Cobrado cero no es cobrado desconocido (R7) ───────────────

test('un lead con ficha y sin cobros dice 0, que es un cero de verdad', async () => {
  const [fila] = await buildTrail([tiktokLead({ paidRevenue: 0, billedRevenue: 0 })]);

  assert.equal(fila['Cobrado (PEN)'], 0);
  assert.equal(fila['Registrado, incl. por cobrar (PEN)'], 0);
});

test('un contacto SIN ficha en el CRM dice "sin dato" y no S/ 0', async () => {
  /*
   * Alguien que escribió desde un anuncio y a quien nadie registró no tiene
   * cobros que consultar. Decir "S/ 0" de él afirma que no pagó nada, cuando lo
   * que pasa es que no sabemos — y con eso se apaga un anuncio que sí vendía.
   */
  const [fila] = await buildTrail([tiktokLead({
    leadId: null,
    paidRevenue: null,
    billedRevenue: null,
    funnelColumn: null
  })]);

  assert.equal(fila['Cobrado (PEN)'], 'sin dato');
  assert.equal(fila['Registrado, incl. por cobrar (PEN)'], 'sin dato');
  assert.equal(fila['Columna del funnel'], 'Sin lead en el CRM');
});

// ────────────────── Los ids siguen viajando como texto ──────────────────────

test('los ids de 19 dígitos llegan enteros y como texto', async () => {
  const [fila] = await buildTrail([tiktokLead()]);

  // Cualquier paso por `Number` les cambia los últimos dígitos, y entonces el
  // cruce contra el Ads Manager deja de cerrar.
  assert.equal(fila['ID de campaña'], '1790000000000000001');
  assert.equal(fila['ID de origen'], '1800000000000000001');
  assert.equal(fila['ID del lead en la plataforma'], '7412');
  assert.equal(typeof fila['ID de campaña'], 'string');
});
