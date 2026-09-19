import ExcelJS from 'exceljs';

/**
 * Exporta el rendimiento de campañas a un libro de Excel (.xlsx) con una hoja
 * por nivel de la jerarquía de Meta, del detalle al agregado:
 *
 *   - "Atribución anuncio → venta" : la hoja con la que se abre el libro. Una
 *                   fila por combinación campaña > conjunto > anuncio, que
 *                   cruza lo que costó ese anuncio en Meta con lo que pasó
 *                   después en el CRM (leads, en qué etapa están, ventas
 *                   cerradas y dinero cobrado), ordenada de mayor a menor
 *                   ingreso para que los anuncios ganadores queden arriba y
 *                   los que sólo queman presupuesto, abajo.
 *
 *   - "Anuncios"  : una fila por anuncio con **las mismas columnas y en el
 *                   mismo orden** que exporta el Administrador de anuncios de
 *                   Meta, para que el archivo se pueda comparar o pegar sobre
 *                   un informe descargado de ahí. Al final se añaden la
 *                   campaña y el conjunto, que Meta no incluye en ese informe
 *                   pero hacen falta al juntar varias campañas en una hoja.
 *   - "Conjuntos de anuncios" : una fila por conjunto, con el presupuesto y el
 *                   objetivo de optimización —que viven en este nivel, no en
 *                   el anuncio— y las mismas métricas del informe.
 *   - "Campañas"  : una fila por campaña, con esas mismas métricas agregadas
 *                   más el funnel real del CRM (conversaciones atribuidas,
 *                   citas, ganados, costos por etapa y ROAS).
 *
 * Los objetos sin entrega salen igual, con las métricas vacías: es lo que hace
 * el propio informe de Meta, y esconderlos daría a entender que no existen.
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

/** Ídem para la entrega ("Entrega de anuncios" en el informe). */
function deliveryLabel(value) {
  if (!value) return '-';
  return DELIVERY_LABELS[value] || String(value).toLowerCase().replace(/_/g, ' ');
}

function budgetTypeLabel(value) {
  if (value === 'diario') return 'Presupuesto diario';
  if (value === 'total') return 'Presupuesto total';
  return '-';
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

/**
 * Columnas del informe a nivel de conjunto de anuncios. Mismo orden que el de
 * anuncios menos las tres clasificaciones comparativas (sólo existen por
 * anuncio) y más el objetivo de optimización, que es lo que de verdad decide
 * la entrega del conjunto.
 */
function adsetColumns(currency) {
  return [
    { header: 'Inicio del informe', key: 'reportStart', width: 17, fmt: DATE_FMT },
    { header: 'Fin del informe', key: 'reportStop', width: 17, fmt: DATE_FMT },
    { header: 'Nombre del conjunto de anuncios', key: 'adsetName', width: 40 },
    { header: 'Entrega de anuncios', key: 'delivery', width: 20 },
    { header: 'Configuración de atribución', key: 'attributionSetting', width: 24 },
    { header: 'Resultados', key: 'results', width: 12, fmt: INT_FMT },
    { header: 'Indicador de resultado', key: 'resultIndicator', width: 34 },
    { header: 'Alcance', key: 'reach', width: 12, fmt: INT_FMT },
    { header: 'Frecuencia', key: 'frequency', width: 12, fmt: DEC_FMT },
    { header: 'Coste por resultados', key: 'costPerResult', width: 19, fmt: MONEY_FMT },
    { header: 'Presupuesto del conjunto de anuncios', key: 'budget', width: 32, fmt: MONEY_FMT },
    { header: 'Tipo de presupuesto del conjunto de anuncios', key: 'budgetType', width: 36 },
    { header: `Importe gastado (${currency})`, key: 'spend', width: 20, fmt: MONEY_FMT },
    { header: 'Inicio', key: 'startTime', width: 14, fmt: DATE_FMT },
    { header: 'Fin', key: 'endTime', width: 14, fmt: DATE_FMT },
    { header: 'Objetivo de optimización', key: 'optimizationGoal', width: 26 },
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
    { header: 'Anuncios del conjunto', key: 'adCount', width: 20, fmt: INT_FMT },
    { header: 'Campaña', key: 'campaignName', width: 34 }
  ];
}

/**
 * Columnas de la hoja de atribución, en tres bloques: de dónde vino el lead,
 * qué costó traerlo y qué pasó con él dentro del CRM.
 */
function adAttributionColumns(currency) {
  return [
    // ── Bloque A: identificación y origen ──
    { header: 'Campaña', key: 'campaignName', width: 34 },
    { header: 'ID del conjunto de anuncios', key: 'adsetId', width: 22 },
    { header: 'Conjunto de anuncios', key: 'adsetName', width: 36 },
    { header: 'ID del anuncio', key: 'adId', width: 20 },
    { header: 'Anuncio', key: 'adName', width: 44 },
    // ── Bloque B: inversión y conversión inicial ──
    { header: `Inversión (${currency})`, key: 'spend', width: 17, fmt: MONEY_FMT },
    { header: 'Impresiones', key: 'impressions', width: 13, fmt: INT_FMT },
    { header: 'Clics en el enlace', key: 'linkClicks', width: 17, fmt: INT_FMT },
    { header: 'CTR del enlace (%)', key: 'linkCtr', width: 18, fmt: DEC_FMT },
    { header: 'Leads generados', key: 'leads', width: 16, fmt: INT_FMT },
    { header: `Costo por lead (${currency})`, key: 'costPerLead', width: 22, fmt: MONEY_FMT },
    // ── Bloque C: calidad y ventas según el CRM ──
    { header: 'Leads en cotización', key: 'quotation', width: 19, fmt: INT_FMT },
    { header: 'Leads en seguimiento', key: 'followUp', width: 20, fmt: INT_FMT },
    { header: 'Leads descartados', key: 'discarded', width: 18, fmt: INT_FMT },
    { header: 'Ventas cerradas', key: 'won', width: 16, fmt: INT_FMT },
    { header: `Ingreso cobrado (${currency})`, key: 'revenue', width: 23, fmt: MONEY_FMT },
    { header: `Ingreso registrado, incl. cuotas por cobrar (${currency})`, key: 'billedRevenue', width: 33, fmt: MONEY_FMT },
    { header: 'ROAS real (CRM)', key: 'roas', width: 16, fmt: DEC_FMT }
  ];
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Una fila de la hoja de atribución. `ad` son las métricas de Meta (null si el
 * anuncio ya no figura en la sincronización) y `crm` el funnel atribuido a ese
 * anuncio (null si el anuncio no trajo ni un lead, que es justo el caso que
 * interesa ver para cortar presupuesto).
 */
function adAttributionRow(campaign, ad, crm) {
  const spend = ad?.spend ?? null;
  const leads = crm?.leads || 0;
  const revenue = crm?.paidRevenue || 0;

  return {
    campaignName: campaign.name,
    adsetId: ad?.adsetId || crm?.adsetId || '-',
    adsetName: ad?.adsetName || crm?.adsetName || '-',
    // Sin anuncio en las métricas se cae al `source_id` del referral: es el
    // identificador con el que llegó el lead y el que permite rastrearlo.
    adId: ad?.adId || crm?.adId || crm?.adSourceId || '-',
    adName: ad?.adName || crm?.adName || crm?.headline || '-',
    spend,
    impressions: ad?.impressions ?? null,
    linkClicks: ad?.linkClicks ?? null,
    linkCtr: ad?.linkCtr ?? null,
    leads,
    costPerLead: spend > 0 && leads > 0 ? round2(spend / leads) : null,
    quotation: crm?.quotation || 0,
    followUp: crm?.followUp || 0,
    discarded: crm?.discarded || 0,
    won: crm?.won || 0,
    revenue,
    billedRevenue: crm?.billedRevenue || 0,
    roas: spend > 0 && revenue > 0 ? round2(revenue / spend) : null
  };
}

/**
 * Ranking de efectividad: primero lo que cerró más dinero, y a igualdad se va
 * bajando por el funnel (ventas, cotizaciones, leads). El último criterio es
 * el gasto en orden descendente, así que entre los anuncios que no produjeron
 * nada sale arriba el que más presupuesto se comió — el primero que conviene
 * apagar.
 */
function byEffectiveness(a, b) {
  return (b.revenue - a.revenue)
    || (b.won - a.won)
    || (b.quotation - a.quotation)
    || (b.leads - a.leads)
    || ((b.spend || 0) - (a.spend || 0));
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

    this.#addAdAttributionSheet(workbook, campaigns, currency);
    this.#addAdsSheet(workbook, campaigns, currency);
    this.#addAdsetsSheet(workbook, campaigns, currency);
    this.#addCampaignsSheet(workbook, campaigns, currency);

    const stamp = new Date().toISOString().slice(0, 10);
    return { workbook, filename: `campanas-meta-ads-${stamp}.xlsx` };
  }

  /**
   * Hoja de atribución anuncio → venta: una fila por campaña > conjunto >
   * anuncio con el cruce entre la inversión de Meta y el desenlace comercial.
   *
   * Se listan los anuncios de las métricas de Meta —incluidos los que no
   * trajeron ningún lead— y, a continuación, los grupos del CRM que no casaron
   * con ninguno de ellos, para que ningún lead atribuido quede fuera del
   * reporte por haberse borrado el anuncio en Meta.
   */
  #addAdAttributionSheet(workbook, campaigns, currency) {
    const sheet = workbook.addWorksheet('Atribución anuncio → venta');
    const columns = adAttributionColumns(currency);
    styleSheet(sheet, columns, 5); // fija los cinco campos de identificación

    const rows = [];
    for (const campaign of campaigns) {
      const crmByAdId = new Map();
      const unmatched = [];
      for (const group of campaign.adBreakdown || []) {
        if (group.adId) crmByAdId.set(String(group.adId), group);
        else unmatched.push(group);
      }

      for (const ad of campaign.metaAds || []) {
        const key = String(ad.adId);
        rows.push(adAttributionRow(campaign, ad, crmByAdId.get(key) || null));
        crmByAdId.delete(key);
      }

      for (const group of [...crmByAdId.values(), ...unmatched]) {
        rows.push(adAttributionRow(campaign, null, group));
      }
    }

    rows.sort(byEffectiveness);
    rows.forEach((row) => sheet.addRow(row));

    if (sheet.rowCount === 1) {
      sheet.addRow({
        campaignName: 'No hay anuncios ni leads atribuidos en el rango seleccionado. Pulsa «Sincronizar con Meta» en la vista de Campañas.'
      });
    }
    return sheet;
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
          delivery: deliveryLabel(ad.delivery),
          attributionSetting: ad.attributionSetting || '-',
          results: ad.results,
          resultIndicator: ad.resultIndicator || '-',
          reach: ad.reach,
          frequency: ad.frequency,
          costPerResult: ad.costPerResult,
          adsetBudget: ad.adsetBudget,
          adsetBudgetType: budgetTypeLabel(ad.adsetBudgetType),
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

  #addAdsetsSheet(workbook, campaigns, currency) {
    const sheet = workbook.addWorksheet('Conjuntos de anuncios');
    const columns = adsetColumns(currency);
    styleSheet(sheet, columns, 3); // fija hasta el nombre del conjunto

    for (const campaign of campaigns) {
      // Cuántos anuncios cuelgan de cada conjunto: es la columna que explica
      // por qué un conjunto con presupuesto no gastó nada (no tiene anuncios).
      const adCountByAdset = new Map();
      for (const ad of campaign.metaAds || []) {
        if (!ad.adsetId) continue;
        adCountByAdset.set(String(ad.adsetId), (adCountByAdset.get(String(ad.adsetId)) || 0) + 1);
      }

      for (const set of campaign.metaAdsets || []) {
        sheet.addRow({
          reportStart: toLocalDate(set.dateStart),
          reportStop: toLocalDate(set.dateStop),
          adsetName: set.adsetName,
          delivery: deliveryLabel(set.delivery),
          attributionSetting: set.attributionSetting || '-',
          results: set.results,
          resultIndicator: set.resultIndicator || '-',
          reach: set.reach,
          frequency: set.frequency,
          costPerResult: set.costPerResult,
          budget: set.budget,
          budgetType: budgetTypeLabel(set.budgetType),
          spend: set.spend,
          startTime: toLocalDate(set.startTime),
          endTime: toLocalDate(set.endTime),
          optimizationGoal: set.optimizationGoal || '-',
          impressions: set.impressions,
          cpm: set.cpm,
          linkClicks: set.linkClicks,
          shopClicks: set.shopClicks,
          costPerLinkClick: set.costPerLinkClick,
          linkCtr: set.linkCtr,
          clicks: set.clicks,
          ctr: set.ctr,
          cpc: set.cpc,
          landingPageViews: set.landingPageViews,
          costPerLandingPageView: set.costPerLandingPageView,
          adCount: adCountByAdset.get(String(set.adsetId)) || 0,
          campaignName: campaign.name
        });
      }
    }

    if (sheet.rowCount === 1) {
      sheet.addRow({
        adsetName: 'Todavía no hay conjuntos de anuncios sincronizados. Pulsa «Sincronizar con Meta» en la vista de Campañas.'
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
