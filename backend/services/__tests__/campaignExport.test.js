import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { CampaignExportService } from '../campaignExportService.js';

/**
 * El valor de la exportación está en que las columnas calcen exactamente con
 * el informe que exporta el Administrador de anuncios de Meta: así el archivo
 * se puede comparar o pegar sobre uno descargado de ahí. Estas pruebas fijan
 * ese orden y comprueban que los valores llegan con el tipo correcto (fechas
 * como fecha, importes como número), no como texto.
 */

/** Las 30 columnas del informe de anuncios de Meta, en su orden exacto. */
const COLUMNAS_META = [
  'Inicio del informe', 'Fin del informe', 'Nombre del anuncio', 'Entrega de anuncios',
  'Configuración de atribución', 'Resultados', 'Indicador de resultado', 'Alcance', 'Frecuencia',
  'Coste por resultados', 'Presupuesto del conjunto de anuncios',
  'Tipo de presupuesto del conjunto de anuncios', 'Importe gastado (PEN)', 'Fin',
  'Clasificación por calidad', 'Clasificación por tasas de interacción',
  'Clasificación por tasa de conversión', 'Impresiones', 'CPM (coste por 1000 impresiones) (PEN)',
  'Clics en el enlace', 'shop_clicks', 'CPC (Coste por clic en el enlace) (PEN)',
  'CTR (tasa de clics en el enlace)', 'Clics (todos)', 'CTR (todos)', 'CPC (todos) (PEN)',
  'Visitas a la página de destino', 'Coste por visita a la página de destino (PEN)',
  'Resultados (iniciales)', 'Indicador de resultados (inicial)'
];

function campaignFixture() {
  return {
    campaigns: [
      {
        id: 1,
        name: 'Ingeniería Civil — Lima Norte',
        platform: 'instagram',
        objective: 'OUTCOME_LEADS',
        status: 'activa',
        source: 'meta',
        currency: 'PEN',
        startDate: '2026-08-01',
        endDate: null,
        lastSyncedAt: '2026-09-17T14:03:00.000Z',
        metrics: {
          metaSpend: 850.12, spend: 850.12, impressions: 12500, reach: 9800, frequency: 1.28,
          clicks: 430, ctr: 3.44, cpc: 1.98, cpm: 68, linkClicks: 310, linkCtr: 2.48,
          costPerLinkClick: 2.74, landingPageViews: 180, costPerLandingPageView: 4.72,
          shopClicks: 7, metaResults: 64, metaResultIndicator: 'Conversaciones con mensajes iniciadas',
          metaCostPerResult: 13.28, attributionSetting: '7d_click_1d_view',
          reportStart: '2026-08-19', reportStop: '2026-09-17', metaMessagingStarted: 64,
          conversations: 58, responded: 55, qualified: 31, appointments: 12, won: 4, lost: 9,
          qualificationRate: 53.4, conversationToAppointmentRate: 20.7, appointmentToWonRate: 33.3,
          avgViability: 72, medianFirstResponseMin: 3.5, costPerConversation: 14.66,
          costPerAppointment: 70.84, costPerWon: 212.53, quotedValue: 9600, roas: 11.29
        },
        metaAds: [
          {
            adId: '1', adName: 'Video testimonial — asesoría de tesis', adsetName: 'Lima Norte 22-35',
            delivery: 'ACTIVE', adsetBudget: 50, adsetBudgetType: 'diario', endTime: null,
            qualityRanking: 'above_average', engagementRanking: 'average',
            conversionRanking: 'below_average_20', impressions: 8200, reach: 6400, frequency: 1.28,
            spend: 560.4, clicks: 280, ctr: 3.41, cpc: 2, cpm: 68.34, linkClicks: 205, linkCtr: 2.5,
            costPerLinkClick: 2.73, landingPageViews: 120, costPerLandingPageView: 4.67, shopClicks: 4,
            messagingStarted: 44, results: 44, resultIndicator: 'Conversaciones con mensajes iniciadas',
            costPerResult: 12.74, attributionSetting: '7d_click_1d_view',
            dateStart: '2026-08-19', dateStop: '2026-09-17'
          },
          {
            adId: '2', adName: 'Carrusel — planes y precios', adsetName: null, delivery: 'PAUSED',
            adsetBudget: null, adsetBudgetType: null, endTime: '2026-09-30',
            qualityRanking: 'unknown', engagementRanking: null, conversionRanking: null,
            impressions: 4300, reach: 3400, frequency: 1.26, spend: 289.72, clicks: 150, ctr: 3.49,
            cpc: 1.93, cpm: 67.38, linkClicks: 105, linkCtr: 2.44, costPerLinkClick: 2.76,
            landingPageViews: 60, costPerLandingPageView: 4.83, shopClicks: 3, messagingStarted: 20,
            results: 20, resultIndicator: 'Conversaciones con mensajes iniciadas', costPerResult: 14.49,
            attributionSetting: '7d_click_1d_view', dateStart: '2026-08-19', dateStop: '2026-09-17'
          }
        ]
      },
      {
        id: 2, name: 'Campaña manual sin Meta', platform: 'whatsapp', objective: null,
        status: 'pausada', source: 'manual', currency: 'PEN', startDate: null, endDate: null,
        lastSyncedAt: null,
        metrics: {
          metaSpend: null, spend: 300, impressions: null, reach: null, frequency: null, clicks: null,
          ctr: null, cpc: null, cpm: null, linkClicks: null, linkCtr: null, costPerLinkClick: null,
          landingPageViews: null, costPerLandingPageView: null, shopClicks: null, metaResults: null,
          metaResultIndicator: null, metaCostPerResult: null, attributionSetting: null,
          reportStart: null, reportStop: null, metaMessagingStarted: null,
          conversations: 5, responded: 4, qualified: 2, appointments: 1, won: 0, lost: 1,
          qualificationRate: 40, conversationToAppointmentRate: 20, appointmentToWonRate: 0,
          avgViability: null, medianFirstResponseMin: null, costPerConversation: 60,
          costPerAppointment: 300, costPerWon: null, quotedValue: 0, roas: null
        },
        metaAds: []
      }
    ]
  };
}

/** Escribe el libro a disco y lo vuelve a leer, como haría Excel al abrirlo. */
async function buildAndReopen(options = {}) {
  const service = new CampaignExportService({
    campaignService: { async getPerformance() { return campaignFixture(); } }
  });
  const { workbook, filename } = await service.buildWorkbook(options);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-export-')), filename);
  await workbook.xlsx.writeFile(file);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(file);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });

  return { workbook: reopened, filename };
}

function headersOf(sheet) {
  return sheet.getRow(1).values.slice(1);
}

test('la hoja de anuncios reproduce las columnas del informe de Meta en orden', async () => {
  const { workbook } = await buildAndReopen();
  const headers = headersOf(workbook.getWorksheet('Anuncios'));

  assert.deepEqual(headers.slice(0, COLUMNAS_META.length), COLUMNAS_META);
  // La campaña y el conjunto van al final para no alterar ese orden.
  assert.deepEqual(headers.slice(COLUMNAS_META.length), ['Campaña', 'Conjunto de anuncios']);
});

test('cada anuncio sale como una fila con sus valores traducidos', async () => {
  const { workbook } = await buildAndReopen();
  const sheet = workbook.getWorksheet('Anuncios');
  const headers = headersOf(sheet);
  const cell = (row, header) => sheet.getRow(row).getCell(headers.indexOf(header) + 1).value;

  assert.equal(sheet.rowCount, 3, 'cabecera + 2 anuncios');
  assert.equal(cell(2, 'Nombre del anuncio'), 'Video testimonial — asesoría de tesis');
  assert.equal(cell(2, 'Entrega de anuncios'), 'activo');
  assert.equal(cell(3, 'Entrega de anuncios'), 'en pausa');
  assert.equal(cell(2, 'Clasificación por calidad'), 'Por encima del promedio');
  assert.equal(cell(2, 'Clasificación por tasa de conversión'), 'Por debajo del promedio (20% inferior de los anuncios)');
  assert.equal(cell(2, 'Tipo de presupuesto del conjunto de anuncios'), 'Presupuesto diario');
  assert.equal(cell(2, 'Campaña'), 'Ingeniería Civil — Lima Norte');

  // Sin clasificación (o 'unknown') Meta escribe un guion, no un vacío.
  assert.equal(cell(3, 'Clasificación por calidad'), '-');
  assert.equal(cell(3, 'Clasificación por tasas de interacción'), '-');
});

test('los importes y conteos salen como números, no como texto', async () => {
  const { workbook } = await buildAndReopen();
  const sheet = workbook.getWorksheet('Anuncios');
  const headers = headersOf(sheet);
  const cell = (header) => sheet.getRow(2).getCell(headers.indexOf(header) + 1).value;

  assert.equal(cell('Resultados'), 44);
  assert.equal(cell('Coste por resultados'), 12.74);
  assert.equal(cell('Importe gastado (PEN)'), 560.4);
  assert.equal(cell('Impresiones'), 8200);
  assert.equal(cell('shop_clicks'), 4);
  assert.equal(cell('Visitas a la página de destino'), 120);
  assert.equal(sheet.getColumn(headers.indexOf('Importe gastado (PEN)') + 1).numFmt, '#,##0.00');
});

test('las fechas del informe no se desfasan un día por la zona horaria', async () => {
  const { workbook } = await buildAndReopen();
  const sheet = workbook.getWorksheet('Anuncios');
  const headers = headersOf(sheet);
  const inicio = sheet.getRow(2).getCell(headers.indexOf('Inicio del informe') + 1).value;

  assert.ok(inicio instanceof Date, 'debería ser una fecha de Excel, no texto');
  assert.equal(inicio.getFullYear(), 2026);
  assert.equal(inicio.getMonth(), 7); // agosto
  assert.equal(inicio.getDate(), 19);
});

test('las columnas de resultados iniciales quedan vacías (Meta no las expone)', async () => {
  const { workbook } = await buildAndReopen();
  const sheet = workbook.getWorksheet('Anuncios');
  const headers = headersOf(sheet);

  assert.equal(sheet.getRow(2).getCell(headers.indexOf('Resultados (iniciales)') + 1).value, null);
  assert.equal(sheet.getRow(2).getCell(headers.indexOf('Indicador de resultados (inicial)') + 1).value, null);
});

test('la hoja de campañas trae el agregado de Meta y el funnel del CRM', async () => {
  const { workbook } = await buildAndReopen();
  const sheet = workbook.getWorksheet('Campañas');
  const headers = headersOf(sheet);
  const cell = (row, header) => sheet.getRow(row).getCell(headers.indexOf(header) + 1).value;

  assert.equal(sheet.rowCount, 3, 'cabecera + 2 campañas');
  assert.equal(cell(2, 'Campaña'), 'Ingeniería Civil — Lima Norte');
  assert.equal(cell(2, 'Resultados'), 64);
  assert.equal(cell(2, 'Citas agendadas'), 12);
  assert.equal(cell(2, 'ROAS'), 11.29);
  // Una campaña manual no tiene métricas de Meta pero sí funnel propio.
  assert.equal(cell(3, 'Campaña'), 'Campaña manual sin Meta');
  assert.equal(cell(3, 'Impresiones'), null);
  assert.equal(cell(3, 'Conversaciones atribuidas (CRM)'), 5);
});

test('campaignIds limita la exportación a las campañas filtradas en pantalla', async () => {
  const { workbook } = await buildAndReopen({ campaignIds: [2] });

  assert.equal(workbook.getWorksheet('Campañas').rowCount, 2, 'cabecera + 1 campaña');
  // La campaña 2 no tiene anuncios: la hoja queda con la fila de aviso.
  const ads = workbook.getWorksheet('Anuncios');
  const headers = headersOf(ads);
  assert.equal(ads.rowCount, 2);
  assert.match(String(ads.getRow(2).getCell(headers.indexOf('Nombre del anuncio') + 1).value), /Sincronizar con Meta/);
});

test('el archivo se nombra con la fecha de generación', async () => {
  const { filename } = await buildAndReopen();
  assert.match(filename, /^campanas-meta-ads-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
