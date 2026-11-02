import ExcelJS from 'exceljs';
import { levelLabel } from './smartPlusLevel.js';

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
 *   - "Ruta de leads" : una fila por lead —atribuido o no—, con por dónde
 *                   entró (plataforma, canal, campaña, conjunto, anuncio,
 *                   titular y los ids de cada nivel), cuánto tardó Avan en
 *                   responderle, si se calificó o agendó, y en qué columna del
 *                   Kanban está hoy. Es el detalle que hay detrás de los
 *                   conteos de la hoja de atribución: ahí se ve que un anuncio
 *                   trajo 7 leads, y acá quiénes son y dónde quedaron. Es
 *                   además la hoja que marketing importa a su planilla, así
 *                   que sus encabezados son un contrato: el importador busca
 *                   las columnas por su nombre y renombrar una la deja fuera
 *                   del reporte sin que nada falle a la vista.
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
const DATETIME_FMT = 'dd/mm/yyyy hh:mm';
/*
 * Formato de TEXTO para las columnas de identificadores. Los ids de Meta y de
 * TikTok tienen 15 a 17 dígitos: leídos como número, Excel les cambia los
 * últimos dígitos y los muestra en notación científica ("1,20223e+16"), y el
 * cruce contra el Administrador de anuncios deja de cerrar. El valor ya viaja
 * como cadena; esto evita además que el propio Excel lo reinterprete si
 * alguien pega la columna en otra hoja.
 */
const TEXT_FMT = '@';

/*
 * Versión del esquema de la hoja "Ruta de leads".
 *
 * Va como COLUMNA y no solo en una celda al margen: esta hoja es un contrato
 * con marketing y su importador busca las columnas por el nombre del
 * encabezado, así que una fila copiada a otra herramienta tiene que poder
 * decir sola con qué esquema se generó. Sin eso, el día que una columna cambie
 * de significado no hay forma de saber si un archivo viejo se puede comparar
 * con uno nuevo.
 *
 *  1 = hasta el 31/10/2026. El origen se deducía en cada lectura del orden en
 *      que estaban escritas las columnas de atribución, y no se publicaba con
 *      qué evidencia se lo supo.
 *  2 = desde el 01/11/2026. El origen es un sello (`leads.origin_platform`) y
 *      la hoja publica la fuente de la atribución, su confianza, la fecha de
 *      conciliación y la plataforma secundaria. "Cobrado" distingue el cero
 *      del desconocido.
 */
export const LEAD_TRAIL_SCHEMA_VERSION = 2;

/** Cómo se nombra en la hoja cada método de emparejamiento. */
const ATTRIBUTION_METHOD_LABELS = {
  platform_lead_id: 'ID del lead en la plataforma',
  note_marker: 'Marcador en las notas',
  webhook: 'Recepción del webhook',
  phone_match: 'Coincidencia de teléfono',
  manual: 'Cargado a mano'
};

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

/**
 * Igual que `toLocalDate` pero conservando la hora, para las marcas de tiempo
 * de la ruta de leads (cuándo escribió, cuándo es la cita).
 *
 * Las partes se leen en horario de Lima y con ellas se construye una fecha
 * local: así la celda queda como fecha de verdad —ordenable y filtrable en
 * Excel— y no como texto, y muestra la misma hora que el panel.
 */
function toLocalDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return new Date(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute)
  );
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
    // Los cinco desenlaces, separados. Agendada y asistida eran una sola
    // columna, así que el anuncio que trae gente que agenda y no aparece se
    // leía igual que el que trae gente que se presenta — y es la diferencia
    // entre un público bueno y uno que hay que dejar de comprar.
    { header: 'Citas agendadas', key: 'appointments', width: 16, fmt: INT_FMT },
    { header: 'Citas asistidas', key: 'attended', width: 16, fmt: INT_FMT },
    { header: 'Leads en cotización', key: 'quotation', width: 19, fmt: INT_FMT },
    { header: 'Leads en seguimiento', key: 'followUp', width: 20, fmt: INT_FMT },
    { header: 'Leads descartados', key: 'discarded', width: 18, fmt: INT_FMT },
    { header: 'Ventas cerradas', key: 'won', width: 16, fmt: INT_FMT },
    // Cerrada no es cobrada: "cobrado" es lo verificado en Finanzas, que es el
    // hecho más difícil de discutir del funnel.
    { header: 'Leads cobrados', key: 'collected', width: 16, fmt: INT_FMT },
    { header: `Ingreso cobrado (${currency})`, key: 'revenue', width: 23, fmt: MONEY_FMT },
    { header: `Ingreso registrado, incl. cuotas por cobrar (${currency})`, key: 'billedRevenue', width: 33, fmt: MONEY_FMT },
    { header: 'ROAS real (CRM)', key: 'roas', width: 16, fmt: DEC_FMT }
  ];
}

function leadTrailColumns(currency) {
  return [
    // ── Quién es ──
    { header: 'Lead', key: 'name', width: 28 },
    { header: 'Teléfono', key: 'phone', width: 16, fmt: TEXT_FMT },
    { header: 'Correo', key: 'email', width: 26 },
    { header: 'Carrera', key: 'career', width: 28 },
    // ── Por dónde llegó ──
    // Por cuál de los dos caminos entró: el formulario instantáneo o el clic
    // en el anuncio que abre WhatsApp. De eso depende qué columnas de esta
    // hoja tienen sentido para esa fila (un formulario no tiene titular del
    // anuncio ni tiempo de primera respuesta de Avan).
    { header: 'Cómo llegó', key: 'origin', width: 14 },
    { header: 'Canal', key: 'channel', width: 16 },
    { header: 'Plataforma', key: 'platform', width: 13 },
    // Facebook o Instagram dentro de Meta: la plataforma es "Meta" en los dos
    // casos, y esto es la red donde la persona vio el anuncio.
    { header: 'Red del anuncio', key: 'network', width: 16 },
    { header: 'Campaña', key: 'campaignName', width: 32 },
    { header: 'ID de campaña', key: 'campaignId', width: 20, fmt: TEXT_FMT },
    { header: 'Conjunto de anuncios', key: 'adsetName', width: 32 },
    { header: 'ID de conjunto', key: 'adsetId', width: 20, fmt: TEXT_FMT },
    { header: 'Anuncio', key: 'adName', width: 38 },
    // El campo con el que se enlaza todo: el id del anuncio, pelado y como
    // texto (ver `bareSourceId` y `TEXT_FMT`).
    { header: 'ID de origen', key: 'adSourceId', width: 20, fmt: TEXT_FMT },
    { header: 'Titular del anuncio', key: 'adHeadline', width: 38 },
    /*
     * La jerarquía de Smart+. Tres ids distintos y no uno: el ANUNCIO compra el
     * presupuesto, la PIEZA es la combinación que armó TikTok y el VIDEO es el
     * archivo subido — un mismo video vive en varias piezas. El nivel dice qué
     * se puede afirmar: con "Anuncio padre (pieza desconocida)", el costo de esa
     * fila es del padre y no de una creatividad concreta.
     */
    { header: 'Nivel de atribución', key: 'attributionLevel', width: 30 },
    { header: 'ID del anuncio padre', key: 'parentAdId', width: 22, fmt: TEXT_FMT },
    { header: 'ID de la pieza creativa', key: 'creativeId', width: 24, fmt: TEXT_FMT },
    { header: 'ID del video', key: 'videoId', width: 22, fmt: TEXT_FMT },
    { header: 'Video', key: 'videoName', width: 32 },
    { header: 'Pieza vigente desde', key: 'creativeValidFrom', width: 20, fmt: DATE_FMT },
    { header: 'Pieza vigente hasta', key: 'creativeValidTo', width: 20, fmt: DATE_FMT },
    { header: 'ID del lead en la plataforma', key: 'platformLeadId', width: 30, fmt: TEXT_FMT },
    // Con qué evidencia se supo todo lo anterior. Sin estas tres la hoja
    // afirma una plataforma y no deja comprobar cómo se llegó a ella.
    { header: 'Fuente de atribución', key: 'attributionMethod', width: 26 },
    { header: 'Confianza de atribución', key: 'attributionConfidence', width: 22 },
    { header: 'Conciliado', key: 'attributionReconciledAt', width: 18, fmt: DATETIME_FMT },
    // La ficha con atribución de más de una plataforma: el origen es el
    // sellado y acá sale lo que llegó después. Es la lista de lo que hay que
    // revisar, y escondida no se revisa.
    { header: 'Plataforma secundaria', key: 'secondaryPlatforms', width: 22 },
    { header: 'Versión del esquema', key: 'schemaVersion', width: 19, fmt: INT_FMT },
    // ── Qué pasó después ──
    // Cuándo entró el lead EN LA PLATAFORMA (`created_time`), que no es
    // cuándo se dio de alta acá: un lead que la conciliación rescató tres
    // días después pertenece al día en que la persona llenó el formulario.
    { header: 'Fecha de ingreso', key: 'enteredAt', width: 18, fmt: DATETIME_FMT },
    { header: 'Primer mensaje', key: 'firstMessageAt', width: 18, fmt: DATETIME_FMT },
    { header: 'Respuesta de Avan (min)', key: 'firstResponseMinutes', width: 22, fmt: DEC_FMT },
    // Separa el chat vacío de la pérdida real: Meta cuenta como conversación
    // iniciada cualquier clic que abre el chat.
    { header: 'Solo saludó', key: 'onlyGreeted', width: 12 },
    { header: 'Calificado', key: 'qualified', width: 12 },
    { header: 'Viabilidad', key: 'viability', width: 12, fmt: INT_FMT },
    { header: 'Cita agendada', key: 'meetingAt', width: 18, fmt: DATETIME_FMT },
    // Tres estados: "Sí", "No" y vacío (nadie lo registró todavía), igual que
    // "Calificado". Un "No" por defecto mostraría como ausencias todas las
    // reuniones viejas, que son casi todas.
    { header: 'Cita asistida', key: 'meetingAttendance', width: 14 },
    // ── Dónde está hoy ──
    { header: 'Columna del funnel', key: 'funnelColumn', width: 24 },
    { header: 'Etapa comercial', key: 'commercialStage', width: 22 },
    { header: 'Fecha de cierre', key: 'closedAt', width: 18, fmt: DATE_FMT },
    // ── Dinero ──
    { header: `Cotizado (${currency})`, key: 'quotedValue', width: 18, fmt: MONEY_FMT },
    { header: `Cobrado (${currency})`, key: 'paidRevenue', width: 17, fmt: MONEY_FMT },
    { header: `Registrado, incl. por cobrar (${currency})`, key: 'billedRevenue', width: 30, fmt: MONEY_FMT }
  ];
}

/*
 * La plataforma de un lead la resuelve `leadOrigin()` y ya viene escrita como
 * la lee marketing ("Meta", "TikTok", "Orgánico", "Referido", "Otro"). Si
 * llegara vacía se escribe "Otro" y no "Meta": el valor por defecto "Meta" es
 * justo lo que hacía figurar los leads de TikTok como si fueran de Meta.
 */
const PLATFORM_FALLBACK = 'Otro';

/**
 * Un identificador, como texto y sin que nada lo convierta a número en el
 * camino. Los ids de anuncio tienen 15 a 17 dígitos y `Number` les cambia los
 * últimos; la celda lleva además formato de texto (ver `TEXT_FMT`).
 */
function asText(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
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
    /*
     * El tercer nivel de WhatsApp, que faltaba. "Conversaciones (Meta)" es el
     * evento atribuido —cualquier clic que abre el chat—, "Conversaciones
     * atribuidas (CRM)" es la que el CRM reconoce, y esta es la que trajo a una
     * persona que NO estaba. Sin ella el costo por conversación se lee como
     * costo por persona nueva, y un anuncio de retargeting —que por definición
     * le habla a quien ya está en la base— parece tan eficiente como uno que
     * trae gente nueva.
     */
    { header: 'Personas nuevas (CRM)', key: 'newOpportunities', width: 22, fmt: INT_FMT },
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
    const report = await this.campaignService.getPerformance({ from, to, includeLeadTrail: true });

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
    this.#addLeadTrailSheet(workbook, report.leadTrail || [], campaigns, campaignIds, currency);
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

  /**
   * Hoja "Ruta de leads": una fila por lead, atribuido o no.
   *
   * Van TODOS los leads del rango y no solo los de campaña. La hoja contesta
   * "¿de dónde salió cada lead?", y con solo los atribuidos no se puede
   * comprobar que ninguno se haya quedado sin plataforma — que es lo que
   * marketing verifica para dar el arreglo por bueno. Los leads cuyo anuncio
   * no está mapeado a ninguna campaña también salen: son contactos reales, y
   * esconderlos daba a entender que el anuncio no trajo a nadie.
   *
   * Dos reglas de redacción, y la diferencia importa: `-` es "acá no hay nada
   * que poner" (un lead orgánico no tiene anuncio) y `sin dato` es "esto vino
   * de un anuncio y el dato falta". Marketing trata lo segundo como dato
   * faltante que hay que ir a buscar, no como cero.
   */
  #addLeadTrailSheet(workbook, leadTrail, campaigns, campaignIds, currency) {
    const sheet = workbook.addWorksheet('Ruta de leads');
    const columns = leadTrailColumns(currency);
    styleSheet(sheet, columns, 2); // fija el lead y su teléfono

    // Si el usuario filtró campañas en pantalla, la hoja respeta ese filtro.
    // Se compara por el id interno de la campaña y no por su nombre porque dos
    // campañas pueden llamarse igual. Los leads sin campaña se conservan: no
    // pertenecen a ninguna, así que ningún filtro por campaña debería hacerlos
    // desaparecer.
    let rows = leadTrail;
    if (campaignIds && campaignIds.length) {
      const wanted = new Set(campaigns.map((c) => Number(c.id)));
      rows = rows.filter((r) => !r.crmCampaignId || wanted.has(Number(r.crmCampaignId)));
    }

    for (const row of rows) {
      // Lo que falta de un lead PAGADO se nombra; lo que no corresponde, no.
      const faltante = row.paid ? 'sin dato' : '-';

      sheet.addRow({
        ...row,
        origin: row.origin || '-',
        channel: row.channel || '-',
        // Nunca vacío y nunca "Meta" por descarte: lo que no se reconoce es
        // "Otro" (ver `leadOrigin.js`).
        platform: row.platform || PLATFORM_FALLBACK,
        network: row.network || '-',
        campaignName: row.campaignName || (row.paid ? 'sin dato' : 'Sin campaña asignada'),
        campaignId: asText(row.campaignId) || faltante,
        adsetName: row.adsetName || faltante,
        adsetId: asText(row.adsetId) || faltante,
        adName: row.adName || faltante,
        adSourceId: asText(row.adSourceId) || faltante,
        adHeadline: row.adHeadline || '-',
        platformLeadId: asText(row.platformLeadId) || '-',
        phone: asText(row.phone) || '-',
        email: row.email || '-',
        career: row.career || '-',
        onlyGreeted: row.onlyGreeted ? 'Sí' : 'No',
        /*
         * Tres estados. La celda vacía es "nadie la calificó todavía" y es
         * información: antes esta columna se derivaba de la etapa del lead y
         * decía "Sí" en el 100% de las filas, con lo que no se podía medir la
         * calidad de ningún anuncio.
         */
        qualified: row.qualified === null || row.qualified === undefined
          ? ''
          : (row.qualified ? 'Sí' : 'No'),
        /*
         * Vacío cuando nadie registró el desenlace: es la misma regla de tres
         * estados que "Calificado", y por la misma razón — un "No" por defecto
         * haría el mismo daño con el signo cambiado, mostrando como ausencias
         * todas las reuniones de las que nadie dijo nada.
         */
        meetingAttendance: row.meetingAttendance === 'asistio' ? 'Sí'
          : row.meetingAttendance === 'no_asistio' ? 'No'
          : '',
        enteredAt: toLocalDateTime(row.enteredAt),
        firstMessageAt: toLocalDateTime(row.firstMessageAt),
        meetingAt: toLocalDateTime(row.meetingAt),
        closedAt: toLocalDateTime(row.closedAt),
        // Sin lead en el CRM no hay columna: el contacto escribió pero nadie
        // lo registró todavía, y decirlo es más útil que dejar la celda vacía.
        funnelColumn: row.funnelColumn || 'Sin lead en el CRM',

        /*
         * Las dos convenciones de esta hoja, aplicadas también acá: `-` es "no
         * corresponde" y `sin dato` es "esto vino de un anuncio y el dato
         * falta". Un lead orgánico no tiene fuente de atribución que publicar;
         * uno pagado que no la tiene es justo lo que marketing va a buscar.
         */
        attributionMethod: ATTRIBUTION_METHOD_LABELS[row.attributionMethod] || faltante,
        attributionConfidence: row.attributionConfidence || faltante,
        attributionReconciledAt: toLocalDateTime(row.attributionReconciledAt),
        secondaryPlatforms: row.secondaryPlatforms || '-',
        schemaVersion: LEAD_TRAIL_SCHEMA_VERSION,

        /*
         * El nivel se nombra siempre, incluso "Desconocido": acá `-` no sirve
         * —no es "no corresponde" sino "no lo sabemos"— y es justo lo que
         * marketing va a ir a buscar para pedir el acceso que falta.
         */
        attributionLevel: levelLabel(row.attributionLevel),
        parentAdId: asText(row.parentAdId) || faltante,
        creativeId: asText(row.creativeId) || (row.paid ? 'desconocida' : '-'),
        videoId: asText(row.videoId) || (row.paid ? 'desconocido' : '-'),
        videoName: row.videoName || (row.paid ? 'desconocido' : '-'),
        creativeValidFrom: toLocalDateTime(row.creativeValidFrom),
        creativeValidTo: toLocalDateTime(row.creativeValidTo),

        /*
         * `null` es "no se puede saber" y `0` es "no entró nada". Un contacto
         * sin ficha en el CRM no tiene cobros que consultar, y escribir S/ 0
         * de él afirma que no pagó nada cuando lo que pasa es que no lo
         * sabemos — con eso se apaga un anuncio que sí vendía.
         */
        paidRevenue: row.paidRevenue ?? 'sin dato',
        billedRevenue: row.billedRevenue ?? 'sin dato'
      });
    }

    if (sheet.rowCount === 1) {
      sheet.addRow({ name: 'No hay leads en el rango seleccionado.' });
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
