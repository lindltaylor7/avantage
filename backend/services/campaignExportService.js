import ExcelJS from 'exceljs';

/**
 * Exporta el rendimiento de campañas a un libro de Excel (.xlsx) con dos
 * hojas:
 *
 *   - "Anuncios"  : una fila por anuncio con **las mismas columnas y en el
 *                   mismo orden** que exporta el Administrador de anuncios de
 *                   Meta, para que el archivo se pueda comparar o pegar sobre
 *                   un informe descargado de ahí. Al final se añaden la
 *                   campaña y el conjunto, que Meta no incluye en ese informe
 *                   pero hacen falta al juntar varias campañas en una hoja.
 *   - "Campañas"  : una fila por campaña, con esas mismas métricas agregadas
 *                   más el funnel real del CRM (conversaciones atribuidas,
 *                   citas, ganados, costos por etapa y ROAS).
 *
 * Los datos salen de `campaignService.getPerformance()`, así que la hoja
 * refleja exactamente lo que muestra la vista de Campañas para el mismo rango.
 */

/** Redacción que usa el propio informe de Meta en español para la entrega. */
const DELIVERY_LABELS = {
  ACTIVE: 'activo',
  PAUSED: 'en pausa',
  ADSET_PAUSED: 'conjunto de anuncios en pausa',
  CAMPAIGN_PAUSED: 'campaña en pausa',
  PENDING_REVIEW: 'en revisión',
  IN_PROCESS: 'en proceso',
  PENDING_BILLING_INFO: 'falta información de pago',
  DISAPPROVED: 'rechazado',
  WITH_ISSUES: 'con problemas',
  ARCHIVED: 'archivado',
  DELETED: 'eliminado',
  COMPLETED: 'finalizado'
};

/** Ídem para las tres clasificaciones comparativas. */
const RANKING_LABELS = {
  above_average: 'Por encima del promedio',
  average: 'Promedio',
  below_average_35: 'Por debajo del promedio (35% inferior de los anuncios)',
  below_average_20: 'Por debajo del promedio (20% inferior de los anuncios)',
  below_average_10: 'Por debajo del promedio (10% inferior de los anuncios)',
  unknown: '-'
};

const STATUS_LABELS = { activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };

const MONEY_FMT = '#,##0.00';
const INT_FMT = '#,##0';
const DEC_FMT = '#,##0.00';
const DATE_FMT = 'dd/mm/yyyy';

/**
 * Convierte el `YYYY-MM-DD` de Meta a una fecha local. `new Date('2026-09-17')`
 * la interpretaría como UTC y en Perú (UTC-5) retrocedería un día.
 */
function toLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function rankingLabel(value) {
  if (!value) return '-';
  return RANKING_LABELS[value] || value;
}

/**
 * Columnas del informe de anuncios de Meta, en su orden exacto. La moneda va
 * en la cabecera igual que en el informe original (`Importe gastado (PEN)`).
 */
function adColumns(currency) {
  return [
    { header: 'Inicio del informe', key: 'reportStart', width: 17, fmt: DATE_FMT },
    { header: 'Fin del informe', key: 'reportStop', width: 17, fmt: DATE_FMT },
    { header: 'Nombre del anuncio', key: 'adName', width: 44 },
    { header: 'Entrega de anuncios', key: 'delivery', width: 20 },
    { header: 'Configuración de atribución', key: 'attributionSetting', width: 24 },
    { header: 'Resultados', key: 'results', width: 12, fmt: INT_FMT },
    { header: 'Indicador de resultado', key: 'resultIndicator', width: 34 },
    { header: 'Alcance', key: 'reach', width: 12, fmt: INT_FMT },
    { header: 'Frecuencia', key: 'frequency', width: 12, fmt: DEC_FMT },
    { header: 'Coste por resultados', key: 'costPerResult', width: 19, fmt: MONEY_FMT },
    { header: 'Presupuesto del conjunto de anuncios', key: 'adsetBudget', width: 32, fmt: MONEY_FMT },
    { header: 'Tipo de presupuesto del conjunto de anuncios', key: 'adsetBudgetType', width: 36 },
    { header: `Importe gastado (${currency})`, key: 'spend', width: 20, fmt: MONEY_FMT },
    { header: 'Fin', key: 'endTime', width: 14, fmt: DATE_FMT },
    { header: 'Clasificación por calidad', key: 'qualityRanking', width: 34 },
    { header: 'Clasificación por tasas de interacción', key: 'engagementRanking', width: 36 },
    { header: 'Clasificación por tasa de conversión', key: 'conversionRanking', width: 36 },
    { header: 'Impresiones', key: 'impressions', width: 13, fmt: INT_FMT },
    { header: `CPM (coste por 1000 impresiones) (${currency})`, key: 'cpm', width: 32, fmt: MONEY_FMT },
    { header: 'Clics en el enlace', key: 'linkClicks', width: 17, fmt: INT_FMT },
    { header: 'shop_clicks', key: 'shopClicks', width: 13, fmt: INT_FMT },
    { header: `CPC (Coste por clic en el enlace) (${currency})`, key: 'costPerLinkClick', width: 32, fmt: MONEY_FMT },
    { header: 'CTR (tasa de clics en el enlace)', key: 'linkCtr', width: 27, fmt: DEC_FMT },
    { header: 'Clics (todos)', key: 'clicks', width: 13, fmt: INT_FMT },
    { header: 'CTR (todos)', key: 'ctr', width: 13, fmt: DEC_FMT },
    { header: `CPC (todos) (${currency})`, key: 'cpc', width: 18, fmt: MONEY_FMT },
    { header: 'Visitas a la página de destino', key: 'landingPageViews', width: 25, fmt: INT_FMT },
    { header: `Coste por visita a la página de destino (${currency})`, key: 'costPerLandingPageView', width: 36, fmt: MONEY_FMT },
    // Meta sólo rellena estas dos cuando la campaña cambió de objetivo a mitad
    // de vuelo, y no las expone por la Marketing API: la columna se mantiene
    // para que el orden calce con el informe original, pero va vacía.
    { header: 'Resultados (iniciales)', key: 'initialResults', width: 19 },
    { header: 'Indicador de resultados (inicial)', key: 'initialResultIndicator', width: 29 },
    // Añadidas al final para no alterar el orden del informe de Meta.
    { header: 'Campaña', key: 'campaignName', width: 34 },
    { header: 'Conjunto de anuncios', key: 'adsetName', width: 32 }
  ];
}

function campaignColumns(currency) {
  return [
    { header: 'Campaña', key: 'name', width: 34 },
    { header: 'Estado', key: 'status', width: 13 },
    { header: 'Plataforma', key: 'platform', width: 13 },
    { header: 'Objetivo', key: 'objective', width: 24 },
    { header: 'Origen', key: 'source', width: 11 },
    { header: 'Inicio', key: 'startDate', width: 13, fmt: DATE_FMT },
    { header: 'Fin', key: 'endDate', width: 13, fmt: DATE_FMT },
    { header: 'Inicio del informe', key: 'reportStart', width: 17, fmt: DATE_FMT },
    { header: 'Fin del informe', key: 'reportStop', width: 17, fmt: DATE_FMT },
    { header: 'Configuración de atribución', key: 'attributionSetting', width: 24 },
    { header: 'Resultados', key: 'metaResults', width: 12, fmt: INT_FMT },
    { header: 'Indicador de resultado', key: 'metaResultIndicator', width: 34 },
    { header: 'Coste por resultados', key: 'metaCostPerResult', width: 19, fmt: MONEY_FMT },
    { header: 'Alcance', key: 'reach', width: 12, fmt: INT_FMT },
    { header: 'Frecuencia', key: 'frequency', width: 12, fmt: DEC_FMT },
    { header: `Importe gastado (${currency})`, key: 'spend', width: 20, fmt: MONEY_FMT },
    { header: 'Impresiones', key: 'impressions', width: 13, fmt: INT_FMT },
    { header: `CPM (${currency})`, key: 'cpm', width: 14, fmt: MONEY_FMT },
    { header: 'Clics en el enlace', key: 'linkClicks', width: 17, fmt: INT_FMT },
    { header: 'shop_clicks', key: 'shopClicks', width: 13, fmt: INT_FMT },
    { header: `CPC del enlace (${currency})`, key: 'costPerLinkClick', width: 22, fmt: MONEY_FMT },
    { header: 'CTR del enlace', key: 'linkCtr', width: 15, fmt: DEC_FMT },
    { header: 'Clics (todos)', key: 'clicks', width: 13, fmt: INT_FMT },
    { header: 'CTR (todos)', key: 'ctr', width: 13, fmt: DEC_FMT },
    { header: `CPC (todos) (${currency})`, key: 'cpc', width: 18, fmt: MONEY_FMT },
    { header: 'Visitas a la página de destino', key: 'landingPageViews', width: 25, fmt: INT_FMT },
    { header: `Coste por visita (${currency})`, key: 'costPerLandingPageView', width: 24, fmt: MONEY_FMT },
    { header: 'Conversaciones (Meta)', key: 'metaMessagingStarted', width: 20, fmt: INT_FMT },
    // ── Funnel real del CRM ──
    { header: 'Conversaciones atribuidas (CRM)', key: 'conversations', width: 27, fmt: INT_FMT },
    { header: 'Respondidos', key: 'responded', width: 13, fmt: INT_FMT },
    { header: 'Calificados', key: 'qualified', width: 13, fmt: INT_FMT },
    { header: 'Citas agendadas', key: 'appointments', width: 16, fmt: INT_FMT },
    { header: 'Ganados', key: 'won', width: 11, fmt: INT_FMT },
    { header: 'Perdidos', key: 'lost', width: 11, fmt: INT_FMT },
    { header: 'Tasa de calificación (%)', key: 'qualificationRate', width: 21, fmt: DEC_FMT },
    { header: 'Conversación → cita (%)', key: 'conversationToAppointmentRate', width: 22, fmt: DEC_FMT },
    { header: 'Cita → ganado (%)', key: 'appointmentToWonRate', width: 19, fmt: DEC_FMT },
    { header: 'Viabilidad promedio (%)', key: 'avgViability', width: 21, fmt: DEC_FMT },
    { header: '1ª respuesta, mediana (min)', key: 'medianFirstResponseMin', width: 25, fmt: DEC_FMT },
    { header: `Costo por conversación (${currency})`, key: 'costPerConversation', width: 28, fmt: MONEY_FMT },
    { header: `Costo por cita (${currency})`, key: 'costPerAppointment', width: 22, fmt: MONEY_FMT },
    { header: `Costo por ganado (${currency})`, key: 'costPerWon', width: 23, fmt: MONEY_FMT },
    { header: `Valor cotizado (${currency})`, key: 'quotedValue', width: 22, fmt: MONEY_FMT },
    { header: 'ROAS', key: 'roas', width: 10, fmt: DEC_FMT },
    { header: 'Última sincronización con Meta', key: 'lastSyncedAt', width: 26 }
  ];
}

/** Cabecera en negrita sobre fondo suave, con filtro y paneles congelados. */
function styleSheet(sheet, columns, freezeColumns) {
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));

  const head = sheet.getRow(1);
  head.font = { bold: true, size: 10 };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 32;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF0E0' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFC4C9AE' } } };
  });

  columns.forEach((col, i) => {
    if (col.fmt) sheet.getColumn(i + 1).numFmt = col.fmt;
  });

  sheet.views = [{ state: 'frozen', xSplit: freezeColumns, ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export class CampaignExportService {
  constructor({ campaignService }) {
    this.campaignService = campaignService;
  }

  /**
   * Arma el libro para el rango pedido. `campaignIds` limita la exportación a
   * las campañas que el usuario tenga filtradas en pantalla; si va vacío se
   * exportan todas.
   */
  async buildWorkbook({ from = null, to = null, campaignIds = null } = {}) {
    const report = await this.campaignService.getPerformance({ from, to });

    let campaigns = report.campaigns;
    if (campaignIds && campaignIds.length) {
      const wanted = new Set(campaignIds.map(Number));
      campaigns = campaigns.filter((c) => wanted.has(Number(c.id)));
    }

    const currency = campaigns.find((c) => c.currency)?.currency || 'PEN';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Panel Tesis Perú';
    workbook.created = new Date();

    this.#addAdsSheet(workbook, campaigns, currency);
    this.#addCampaignsSheet(workbook, campaigns, currency);

    const stamp = new Date().toISOString().slice(0, 10);
    return { workbook, filename: `campanas-meta-ads-${stamp}.xlsx` };
  }

  #addAdsSheet(workbook, campaigns, currency) {
    const sheet = workbook.addWorksheet('Anuncios');
    const columns = adColumns(currency);
    styleSheet(sheet, columns, 3); // fija hasta el nombre del anuncio

    for (const campaign of campaigns) {
      for (const ad of campaign.metaAds || []) {
        sheet.addRow({
          reportStart: toLocalDate(ad.dateStart),
          reportStop: toLocalDate(ad.dateStop),
          adName: ad.adName,
          delivery: ad.delivery ? (DELIVERY_LABELS[ad.delivery] || ad.delivery.toLowerCase().replace(/_/g, ' ')) : '-',
          attributionSetting: ad.attributionSetting || '-',
          results: ad.results,
          resultIndicator: ad.resultIndicator || '-',
          reach: ad.reach,
          frequency: ad.frequency,
          costPerResult: ad.costPerResult,
          adsetBudget: ad.adsetBudget,
          adsetBudgetType: ad.adsetBudgetType === 'diario' ? 'Presupuesto diario'
            : ad.adsetBudgetType === 'total' ? 'Presupuesto total' : '-',
          spend: ad.spend,
          endTime: toLocalDate(ad.endTime),
          qualityRanking: rankingLabel(ad.qualityRanking),
          engagementRanking: rankingLabel(ad.engagementRanking),
          conversionRanking: rankingLabel(ad.conversionRanking),
          impressions: ad.impressions,
          cpm: ad.cpm,
          linkClicks: ad.linkClicks,
          shopClicks: ad.shopClicks,
          costPerLinkClick: ad.costPerLinkClick,
          linkCtr: ad.linkCtr,
          clicks: ad.clicks,
          ctr: ad.ctr,
          cpc: ad.cpc,
          landingPageViews: ad.landingPageViews,
          costPerLandingPageView: ad.costPerLandingPageView,
          initialResults: null,
          initialResultIndicator: null,
          campaignName: campaign.name,
          adsetName: ad.adsetName || '-'
        });
      }
    }

    if (sheet.rowCount === 1) {
      sheet.addRow({
        adName: 'Todavía no hay métricas por anuncio. Pulsa «Sincronizar con Meta» en la vista de Campañas.'
      });
    }
    return sheet;
  }

  #addCampaignsSheet(workbook, campaigns, currency) {
    const sheet = workbook.addWorksheet('Campañas');
    const columns = campaignColumns(currency);
    styleSheet(sheet, columns, 1);

    for (const campaign of campaigns) {
      const m = campaign.metrics;
      sheet.addRow({
        name: campaign.name,
        status: STATUS_LABELS[campaign.status] || campaign.status,
        platform: campaign.platform,
        objective: campaign.objective || '-',
        source: campaign.source === 'meta' ? 'Meta Ads' : 'Manual',
        startDate: toLocalDate(campaign.startDate),
        endDate: toLocalDate(campaign.endDate),
        reportStart: toLocalDate(m.reportStart),
        reportStop: toLocalDate(m.reportStop),
        attributionSetting: m.attributionSetting || '-',
        metaResults: m.metaResults,
        metaResultIndicator: m.metaResultIndicator || '-',
        metaCostPerResult: m.metaCostPerResult,
        reach: m.reach,
        frequency: m.frequency,
        spend: m.metaSpend ?? m.spend,
        impressions: m.impressions,
        cpm: m.cpm,
        linkClicks: m.linkClicks,
        shopClicks: m.shopClicks,
        costPerLinkClick: m.costPerLinkClick,
        linkCtr: m.linkCtr,
        clicks: m.clicks,
        ctr: m.ctr,
        cpc: m.cpc,
        landingPageViews: m.landingPageViews,
        costPerLandingPageView: m.costPerLandingPageView,
        metaMessagingStarted: m.metaMessagingStarted,
        conversations: m.conversations,
        responded: m.responded,
        qualified: m.qualified,
        appointments: m.appointments,
        won: m.won,
        lost: m.lost,
        qualificationRate: m.qualificationRate,
        conversationToAppointmentRate: m.conversationToAppointmentRate,
        appointmentToWonRate: m.appointmentToWonRate,
        avgViability: m.avgViability,
        medianFirstResponseMin: m.medianFirstResponseMin,
        costPerConversation: m.costPerConversation,
        costPerAppointment: m.costPerAppointment,
        costPerWon: m.costPerWon,
        quotedValue: m.quotedValue,
        roas: m.roas,
        lastSyncedAt: campaign.lastSyncedAt
          ? new Date(campaign.lastSyncedAt).toLocaleString('es-PE')
          : 'Sin sincronizar'
      });
    }

    if (sheet.rowCount === 1) {
      sheet.addRow({ name: 'No hay campañas en el rango seleccionado.' });
    }
    return sheet;
  }
}
