import { db } from '../db/connection.js';
import { downloadAdCreativeImage } from './adCreativeImage.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Cuántas páginas de resultados de la Graph API se siguen como máximo. */
const MAX_PAGES = 20;

/** Mapea el estado de Meta a los estados internos del panel. */
function mapStatus(metaStatus) {
  const s = String(metaStatus || '').toUpperCase();
  if (s === 'ACTIVE') return 'activa';
  if (s === 'PAUSED') return 'pausada';
  return 'finalizada'; // ARCHIVED, DELETED, COMPLETED, ...
}

/** Normaliza el ID de la cuenta publicitaria (acepta con o sin prefijo `act_`). */
function normalizeAccountId(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  return clean.startsWith('act_') ? clean : `act_${clean}`;
}

/** Tipos de acción con los que Meta cuenta una conversación de mensajería. */
const MESSAGING_ACTION_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
  'messaging_conversation_started_7d'
];

function round2(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

/** Suma el valor de las acciones de `actions` cuyo tipo esté en `types`. */
function sumActions(actions, types) {
  if (!Array.isArray(actions)) return 0;
  const want = new Set(types);
  return actions
    .filter((a) => want.has(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

/** Igual que `sumActions` pero por expresión regular (los tipos de tienda varían). */
function sumActionsMatching(actions, pattern) {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => pattern.test(String(a.action_type || '')))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

/** Primer valor de `cost_per_action_type` para alguno de los tipos pedidos. */
function costPerAction(costs, types) {
  if (!Array.isArray(costs)) return null;
  const want = new Set(types);
  const hit = costs.find((c) => want.has(c.action_type));
  return hit ? round2(hit.value) : null;
}

const LEAD_ACTION_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const PURCHASE_ACTION_TYPES = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];

const R_MESSAGING = { types: MESSAGING_ACTION_TYPES, label: 'Conversaciones con mensajes iniciadas' };
const R_LEADS = { types: LEAD_ACTION_TYPES, label: 'Clientes potenciales' };
const R_PURCHASE = { types: PURCHASE_ACTION_TYPES, label: 'Compras' };
const R_LANDING = { types: ['landing_page_view'], label: 'Visitas a la página de destino' };
const R_LINK = { types: ['link_click'], label: 'Clics en el enlace' };
const R_ENGAGEMENT = { types: ['post_engagement', 'page_engagement'], label: 'Interacciones con la publicación' };
const R_VIDEO = { types: ['video_view'], label: 'Reproducciones de video' };
const R_INSTALLS = { types: ['mobile_app_install', 'app_install'], label: 'Instalaciones de la aplicación' };
const R_REACH = { metric: 'reach', label: 'Alcance' };

/**
 * "Resultados" e "Indicador de resultado" del Administrador de anuncios: Meta
 * no expone esa columna ya resuelta por la API, la calcula según el objetivo
 * de optimización de la campaña. Se reconstruye eligiendo, para cada objetivo,
 * la primera acción candidata que tenga valor — así una campaña de mensajes
 * reporta conversaciones y una de tráfico, clics en el enlace.
 */
const RESULT_CANDIDATES_BY_OBJECTIVE = {
  MESSAGES: [R_MESSAGING],
  OUTCOME_LEADS: [R_MESSAGING, R_LEADS, R_LANDING],
  LEAD_GENERATION: [R_LEADS, R_MESSAGING],
  CONVERSIONS: [R_PURCHASE, R_LEADS, R_LANDING],
  OUTCOME_SALES: [R_PURCHASE, R_LEADS, R_LANDING],
  OUTCOME_TRAFFIC: [R_LANDING, R_LINK],
  LINK_CLICKS: [R_LINK, R_LANDING],
  OUTCOME_ENGAGEMENT: [R_MESSAGING, R_ENGAGEMENT, R_VIDEO],
  POST_ENGAGEMENT: [R_ENGAGEMENT],
  VIDEO_VIEWS: [R_VIDEO],
  OUTCOME_AWARENESS: [R_REACH],
  BRAND_AWARENESS: [R_REACH],
  REACH: [R_REACH],
  OUTCOME_APP_PROMOTION: [R_INSTALLS],
  APP_INSTALLS: [R_INSTALLS]
};

/** Orden por defecto cuando el objetivo de la campaña no se reconoce. */
const DEFAULT_RESULT_CANDIDATES = [R_MESSAGING, R_LEADS, R_PURCHASE, R_LANDING, R_LINK, R_ENGAGEMENT];

function resolveResult(row) {
  const objective = String(row.objective || '').toUpperCase();
  const candidates = RESULT_CANDIDATES_BY_OBJECTIVE[objective] || DEFAULT_RESULT_CANDIDATES;
  for (const candidate of candidates) {
    const value = candidate.metric === 'reach'
      ? Number(row.reach || 0)
      : sumActions(row.actions, candidate.types);
    if (value > 0) return { value, label: candidate.label };
  }
  return { value: null, label: null };
}

/**
 * Traduce una fila de `/insights` (de campaña o de anuncio) al mismo juego de
 * métricas que muestra el Administrador de anuncios, con los nombres que usa
 * el panel. Se aplica igual en los dos niveles para que la tabla por anuncio y
 * el resumen de la campaña sean comparables columna a columna.
 */
function normalizeInsightRow(row) {
  const spend = Number(row.spend || 0);
  const result = resolveResult(row);
  return {
    objective: row.objective || null,
    impressions: Number(row.impressions || 0),
    reach: Number(row.reach || 0),
    frequency: round2(row.frequency),
    spend,
    clicks: Number(row.clicks || 0),                              // Clics (todos)
    ctr: round2(row.ctr),                                         // CTR (todos)
    cpc: round2(row.cpc),                                         // CPC (todos)
    cpm: round2(row.cpm),
    linkClicks: Number(row.inline_link_clicks || 0),              // Clics en el enlace
    linkCtr: round2(row.inline_link_click_ctr),                   // CTR del enlace
    costPerLinkClick: round2(row.cost_per_inline_link_click),     // CPC del enlace
    landingPageViews: sumActions(row.actions, ['landing_page_view']),
    costPerLandingPageView: costPerAction(row.cost_per_action_type, ['landing_page_view']),
    shopClicks: sumActionsMatching(row.actions, /shop_click/),
    messagingStarted: sumActions(row.actions, MESSAGING_ACTION_TYPES),
    results: result.value,
    resultIndicator: result.label,
    costPerResult: result.value > 0 && spend > 0 ? round2(spend / result.value) : null,
    attributionSetting: row.attribution_setting || null,
    dateStart: row.date_start || null,
    dateStop: row.date_stop || null
  };
}

/**
 * Un objeto que nunca llegó a entregarse no tiene fila de insights. Meta lo
 * lista igual, con "—" en las métricas y 0 en el gasto: devolver ceros en todo
 * confundiría "no gastó nada" con "no se midió".
 */
function emptyInsightRow() {
  return {
    objective: null, impressions: null, reach: null, frequency: null, spend: 0,
    clicks: null, ctr: null, cpc: null, cpm: null,
    linkClicks: null, linkCtr: null, costPerLinkClick: null,
    landingPageViews: null, costPerLandingPageView: null, shopClicks: null,
    messagingStarted: null, results: null, resultIndicator: null, costPerResult: null,
    attributionSetting: null, dateStart: null, dateStop: null
  };
}

/**
 * Campos de `/insights`. Meta rechaza la petición entera si un solo campo no
 * está disponible para la cuenta o la versión del Graph, así que cada nivel
 * lleva un juego reducido de respaldo con el que se reintenta.
 */
const CAMPAIGN_INSIGHT_FIELDS = 'campaign_id,objective,impressions,reach,frequency,clicks,ctr,cpc,cpm,spend,'
  + 'inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,cost_per_action_type,'
  + 'attribution_setting,date_start,date_stop';
const CAMPAIGN_INSIGHT_FIELDS_FALLBACK = 'campaign_id,objective,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,date_start,date_stop';
const ADSET_INSIGHT_FIELDS = 'adset_id,adset_name,campaign_id,objective,impressions,reach,frequency,clicks,ctr,cpc,cpm,'
  + 'spend,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,cost_per_action_type,'
  + 'attribution_setting,date_start,date_stop';
const ADSET_INSIGHT_FIELDS_FALLBACK = 'adset_id,adset_name,campaign_id,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,date_start,date_stop';
const AD_INSIGHT_FIELDS = 'ad_id,ad_name,adset_id,adset_name,campaign_id,objective,impressions,reach,frequency,'
  + 'clicks,ctr,cpc,cpm,spend,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,'
  + 'cost_per_action_type,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,attribution_setting,'
  + 'date_start,date_stop';
const AD_INSIGHT_FIELDS_FALLBACK = 'ad_id,ad_name,adset_id,campaign_id,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,date_start,date_stop';

/** `daily_budget`/`lifetime_budget` llegan en céntimos de la moneda de la cuenta. */
function budgetFromCents(value) {
  const cents = Number(value || 0);
  return cents > 0 ? Math.round(cents) / 100 : null;
}

function toDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

/**
 * Los presets `last_Nd` de Meta terminan AYER: lo que pasó hoy no entra en
 * ellos. Como el panel se compara contra el Administrador de anuncios —donde
 * lo normal es mirar "Hoy"— un resultado de hoy parecía perdido. Por eso la
 * ventana se pide como rango explícito que llega hasta hoy, y el preset sólo
 * decide cuántos días abarca.
 */
const PRESET_DAYS = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

/** `YYYY-MM-DD` de un instante desplazado al huso de la cuenta. */
function dayInAccountTz(millis, offsetHours) {
  return new Date(millis + offsetHours * 3600000).toISOString().slice(0, 10);
}

/**
 * Integración con la Meta Marketing API: importa las campañas de Ads, mapea
 * automáticamente sus anuncios (para atribuir el tráfico Click-to-WhatsApp por
 * `referral.source_id`) y trae las métricas de rendimiento del Administrador de
 * anuncios, a nivel de campaña y desglosadas por anuncio (gasto, resultados y
 * coste por resultado, alcance, frecuencia, impresiones, CPM, clics y CTR/CPC
 * del enlace y totales, visitas a la página de destino, conversaciones de
 * mensajería iniciadas y las tres clasificaciones de calidad).
 */
/**
 * `account_status` de una cuenta publicitaria, tal como lo documenta Meta.
 * Solo el 1 deja entregar datos nuevos; el resto se muestra tal cual para que
 * quien lo lee sepa QUÉ hay que regularizar (no es lo mismo pagar una factura
 * que esperar una revisión de riesgo).
 */
const ACCOUNT_STATUS_LABELS = {
  1: 'activa',
  2: 'deshabilitada por Meta',
  3: 'con pagos pendientes',
  7: 'en revisión de riesgo',
  8: 'esperando la liquidación del pago',
  9: 'en periodo de gracia por falta de pago',
  100: 'en proceso de cierre',
  101: 'cerrada'
};

/** `disable_reason`: por qué Meta deshabilitó la cuenta (0 = no lo está). */
const DISABLE_REASON_LABELS = {
  1: 'incumplimiento de las políticas de anuncios',
  2: 'revisión de propiedad intelectual',
  3: 'riesgo en el método de pago',
  4: 'cierre de cuenta marcada como sospechosa',
  5: 'revisión de facturación',
  6: 'revisión de integridad del negocio',
  7: 'cierre permanente',
  8: 'cuenta de revendedor sin uso',
  9: 'cuenta sin uso'
};

/** Texto del aviso: estado y, si lo hay, el motivo de la deshabilitación. */
export function describeAccountStatus(accountStatus, disableReason) {
  const status = Number(accountStatus);
  const label = ACCOUNT_STATUS_LABELS[status] || `estado ${status}`;
  const reason = DISABLE_REASON_LABELS[Number(disableReason)];
  return reason ? `${label} · ${reason}` : label;
}

export class MetaAdsService {
  constructor({ fetchImpl } = {}) {
    this.fetch = fetchImpl || globalThis.fetch;
    this._resolvedAccount = null; // cache: { id, name }
    this._tzOffsetHours = null;   // cache: huso de la cuenta, para fijar "hoy"
  }

  get accessToken() {
    return process.env.META_ADS_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || null;
  }

  /**
   * Resuelve la cuenta publicitaria: usa META_ADS_ACCOUNT_ID si está definida,
   * o la descubre automáticamente con el token vía `/me/adaccounts` (igual que
   * el panel de Instagram descubre la cuenta de IG con el Page Access Token).
   */
  async resolveAccount({ force = false } = {}) {
    if (this._resolvedAccount && !force) return this._resolvedAccount;
    if (!this.accessToken) {
      const e = new Error('No hay ningún token de Meta configurado (META_ADS_ACCESS_TOKEN o META_PAGE_ACCESS_TOKEN).');
      e.code = 'NO_TOKEN';
      throw e;
    }

    const envId = normalizeAccountId(process.env.META_ADS_ACCOUNT_ID);
    if (envId) {
      this._resolvedAccount = { id: envId, name: null, source: 'env' };
      return this._resolvedAccount;
    }

    const accounts = await this.#graphGet('me/adaccounts', { fields: 'id,name,account_status', limit: '50' });
    if (!accounts.length) {
      const e = new Error('El token no tiene acceso a ninguna cuenta publicitaria. Verifica que incluya el permiso ads_read y que el usuario/System User esté asignado a la cuenta de Meta Ads.');
      e.code = 'NO_AD_ACCOUNT';
      throw e;
    }
    const active = accounts.find((a) => Number(a.account_status) === 1) || accounts[0];
    this._resolvedAccount = { id: normalizeAccountId(active.id), name: active.name || null, source: 'auto', options: accounts.length };
    return this._resolvedAccount;
  }

  /** Estado de la integración, con comprobación en vivo contra el Graph API. */
  async status() {
    if (!this.accessToken) {
      return { configured: false, reason: 'no_token', hasToken: false };
    }
    try {
      const account = await this.resolveAccount({ force: true });

      // `resolveAccount` NO toca el Graph cuando la cuenta viene de
      // META_ADS_ACCOUNT_ID, así que sin esta llamada el panel daría por buena
      // una configuración con el token ya muerto (y luego fallaría al
      // sincronizar). Leer la propia cuenta valida el token y, de paso, trae
      // el nombre y la moneda reales.
      const live = await this.#graphGet(account.id, { fields: 'id,name,account_status,disable_reason,currency' });
      const inactive = live.account_status != null && Number(live.account_status) !== 1;

      return {
        configured: true,
        hasToken: true,
        usingPageToken: !process.env.META_ADS_ACCESS_TOKEN,
        accountId: account.id,
        accountName: live.name || account.name,
        accountCurrency: live.currency || null,
        // 1 = activa; cualquier otro valor (deshabilitada, con pagos
        // pendientes, en revisión) impide que Meta entregue datos nuevos. Se
        // reporta CUÁL es, porque de eso depende qué tiene que hacer el
        // equipo para destrabarla.
        accountDisabled: inactive,
        accountStatus: live.account_status != null ? Number(live.account_status) : null,
        accountStatusLabel: inactive ? describeAccountStatus(live.account_status, live.disable_reason) : null,
        accountSource: account.source,
        accountOptions: account.options || 1
      };
    } catch (err) {
      return {
        configured: false,
        hasToken: true,
        // El código 190 es siempre "token inválido": caducado, revocado o con
        // la sesión cerrada. Se distingue del resto porque la solución es otra
        // (regenerar el token, no tocar permisos ni el ID de cuenta).
        reason: err.metaCode === 190 ? 'invalid_token' : (err.code || 'error').toLowerCase(),
        error: err.message,
        metaCode: err.metaCode || null
      };
    }
  }

  /** GET a un endpoint del Graph con paginación por `paging.next`. */
  async #graphGet(path, params = {}) {
    const search = new URLSearchParams({ ...params, access_token: this.accessToken });
    let url = `${GRAPH_BASE}/${path}?${search.toString()}`;
    const out = [];

    for (let page = 0; page < MAX_PAGES && url; page++) {
      const res = await this.fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) {
        const err = json.error || {};
        const detail = err.message || `HTTP ${res.status}`;
        const e = new Error(`Meta Marketing API: ${detail}`);
        e.metaCode = err.code;
        e.metaSubcode = err.error_subcode;
        throw e;
      }
      if (Array.isArray(json.data)) out.push(...json.data);
      else return json;
      url = json.paging?.next || null;
    }
    return out;
  }

  /**
   * Sincroniza campañas + anuncios + métricas. `datePreset` es la ventana de
   * insights de Meta (today | last_7d | last_30d | last_90d | maximum); las
   * de varios días se traducen a un rango que llega hasta hoy (`#timeParams`).
   */
  async sync({ datePreset = 'last_30d' } = {}) {
    const account = (await this.resolveAccount()).id;
    const timeParams = await this.#timeParams(account, datePreset);
    const window = timeParams.time_range ? JSON.parse(timeParams.time_range) : { preset: datePreset };
    const summary = {
      campaigns: 0, adsets: 0, adsMapped: 0, insightsUpdated: 0, adsetInsights: 0, adInsights: 0,
      adAccount: account, datePreset, window, errors: []
    };

    // 1) Campañas
    const campaigns = await this.#graphGet(`${account}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,start_time,stop_time,daily_budget,lifetime_budget',
      limit: '200'
    });

    const localIdByExternal = new Map();
    for (const c of campaigns) {
      const daily = budgetFromCents(c.daily_budget);
      const lifetime = budgetFromCents(c.lifetime_budget);
      const patch = {
        name: c.name || `Campaña ${c.id}`,
        source: 'meta',
        external_id: String(c.id),
        objective: c.objective || null,
        status: mapStatus(c.effective_status || c.status),
        meta_status: c.effective_status || c.status || null,
        start_date: toDateOnly(c.start_time),
        end_date: toDateOnly(c.stop_time),
        // Sin presupuesto propio, la campaña lo lleva en cada conjunto (CBO
        // desactivado); Meta lo muestra como "Con el presupuesto del conjunto".
        budget_type: daily ? 'diario' : (lifetime ? 'total' : null),
        last_synced_at: db.fn.now(),
        updated_at: db.fn.now()
      };
      const budget = daily ?? lifetime;
      if (budget) patch.budget_total = budget;

      const existing = await db('campaigns').where({ external_id: String(c.id) }).first();
      if (existing) {
        await db('campaigns').where({ id: existing.id }).update(patch);
        localIdByExternal.set(String(c.id), existing.id);
      } else {
        const [id] = await db('campaigns').insert({ currency: 'PEN', budget_total: 0, ...patch });
        localIdByExternal.set(String(c.id), id);
      }
      summary.campaigns++;
    }

    // 2) Conjuntos de anuncios. Se listan todos —no sólo los que tienen
    //    métricas— porque el panel replica la jerarquía del Administrador de
    //    anuncios, donde un conjunto sin entrega también aparece en la tabla.
    let adsets = [];
    try {
      adsets = await this.#graphGet(`${account}/adsets`, {
        fields: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal',
        limit: '500'
      });
    } catch (err) {
      summary.errors.push(`No se pudieron traer los conjuntos de anuncios: ${err.message}`);
    }

    const adsetMetaById = new Map();
    for (const set of adsets) {
      const daily = budgetFromCents(set.daily_budget);
      const lifetime = budgetFromCents(set.lifetime_budget);
      adsetMetaById.set(String(set.id), {
        adsetId: String(set.id),
        adsetName: set.name || `Conjunto ${set.id}`,
        campaignExternalId: String(set.campaign_id),
        delivery: set.effective_status || null,
        budget: daily ?? lifetime,
        budgetType: daily ? 'diario' : (lifetime ? 'total' : null),
        startTime: set.start_time || null,
        endTime: set.end_time || null,
        optimizationGoal: set.optimization_goal || null
      });
      summary.adsets++;
    }

    // 3) Anuncios -> mapeo automático. El `referral.source_id` que manda
    //    WhatsApp puede ser el ID del anuncio, el ID de la publicación detrás
    //    del anuncio (effective_object_story_id) o el ID del media de Instagram,
    //    según el tipo de anuncio. Se mapean TODOS los candidatos a la campaña.
    let ads = [];
    try {
      ads = await this.#graphGet(`${account}/ads`, {
        fields: 'id,name,campaign_id,adset_id,effective_status,created_time,'
          + 'creative{effective_object_story_id,effective_instagram_media_id,object_story_id,thumbnail_url}',
        limit: '500'
      });
    } catch (err) {
      summary.errors.push(`No se pudieron traer los anuncios: ${err.message}`);
    }

    const mappedSourceIds = new Set();
    // La campaña se reconoce de un vistazo por la imagen del creativo de su
    // primer anuncio; cada anuncio guarda además la suya para la pestaña de
    // Anuncios.
    const imageSetForCampaign = new Set();
    const adMetaById = new Map();

    for (const ad of ads) {
      const localCampaignId = localIdByExternal.get(String(ad.campaign_id));

      // La imagen se pide al creativo (`thumbnail_url`), no al post: la
      // mayoría de anuncios son un "dark post" (publicación no publicada en el
      // muro) y la Graph API devuelve 404 al leerlo como post normal
      // (`{post-id}?fields=full_picture`).
      const image = await downloadAdCreativeImage(ad.creative?.thumbnail_url || null, String(ad.id), { label: 'Meta Ads' });
      adMetaById.set(String(ad.id), {
        adId: String(ad.id),
        adName: ad.name || `Anuncio ${ad.id}`,
        campaignExternalId: String(ad.campaign_id),
        adsetId: ad.adset_id ? String(ad.adset_id) : null,
        delivery: ad.effective_status || null,
        createdTime: ad.created_time || null,
        imageFilename: image?.filename || null
      });

      if (!localCampaignId) continue;

      const storyId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id || null;
      const candidates = new Set([String(ad.id)]);
      if (storyId) {
        candidates.add(String(storyId));
        if (storyId.includes('_')) candidates.add(storyId.split('_').pop());
      }
      if (ad.creative?.effective_instagram_media_id) {
        candidates.add(String(ad.creative.effective_instagram_media_id));
      }

      for (const sourceId of candidates) {
        if (!sourceId || mappedSourceIds.has(sourceId)) continue;
        mappedSourceIds.add(sourceId);
        await db('campaign_ads')
          .insert({ campaign_id: localCampaignId, ad_source_id: sourceId, ad_label: ad.name || null })
          .onConflict('ad_source_id')
          .merge({ campaign_id: localCampaignId, ad_label: ad.name || null });
      }

      if (image && !imageSetForCampaign.has(localCampaignId)) {
        imageSetForCampaign.add(localCampaignId);
        await db('campaigns').where({ id: localCampaignId }).update({
          ad_image_filename: image.filename,
          ad_image_mime_type: image.mimeType
        });
      }

      summary.adsMapped++;
    }

    // 4) Métricas por campaña
    try {
      const insights = await this.#insights(account, {
        level: 'campaign',
        timeParams,
        fields: CAMPAIGN_INSIGHT_FIELDS,
        fallbackFields: CAMPAIGN_INSIGHT_FIELDS_FALLBACK
      });

      for (const row of insights) {
        const localCampaignId = localIdByExternal.get(String(row.campaign_id));
        if (!localCampaignId) continue;
        await db('campaigns').where({ id: localCampaignId }).update({
          meta_insights: JSON.stringify({ ...normalizeInsightRow(row), window: datePreset, windowRange: window }),
          last_synced_at: db.fn.now()
        });
        summary.insightsUpdated++;
      }
    } catch (err) {
      summary.errors.push(`No se pudieron traer las métricas: ${err.message}`);
    }

    // 5) Métricas por conjunto y por anuncio. Las filas salen de la lista de
    //    objetos (paso 2 y 3) y se les pega el insight que corresponda, no al
    //    revés: así un conjunto o un anuncio sin entrega sigue apareciendo.
    const adsetInsightsById = await this.#insightsById(account, {
      level: 'adset',
      timeParams,
      idField: 'adset_id',
      fields: ADSET_INSIGHT_FIELDS,
      fallbackFields: ADSET_INSIGHT_FIELDS_FALLBACK,
      summary,
      what: 'los conjuntos de anuncios'
    });

    const adInsightsById = await this.#insightsById(account, {
      level: 'ad',
      timeParams,
      idField: 'ad_id',
      fields: AD_INSIGHT_FIELDS,
      fallbackFields: AD_INSIGHT_FIELDS_FALLBACK,
      summary,
      what: 'los anuncios'
    });

    const adsetRowsByCampaign = new Map();
    for (const meta of adsetMetaById.values()) {
      const localCampaignId = localIdByExternal.get(meta.campaignExternalId);
      if (!localCampaignId) continue;
      const insight = adsetInsightsById.get(meta.adsetId);
      if (!adsetRowsByCampaign.has(localCampaignId)) adsetRowsByCampaign.set(localCampaignId, []);
      adsetRowsByCampaign.get(localCampaignId).push({
        adsetId: meta.adsetId,
        adsetName: insight?.adset_name || meta.adsetName,
        delivery: meta.delivery,
        budget: meta.budget,
        budgetType: meta.budgetType,
        startTime: meta.startTime,
        endTime: meta.endTime,
        optimizationGoal: meta.optimizationGoal,
        hasInsights: !!insight,
        ...(insight ? normalizeInsightRow(insight) : emptyInsightRow())
      });
    }

    const adRowsByCampaign = new Map();
    for (const meta of adMetaById.values()) {
      const localCampaignId = localIdByExternal.get(meta.campaignExternalId);
      if (!localCampaignId) continue;
      const insight = adInsightsById.get(meta.adId);
      const adset = meta.adsetId ? adsetMetaById.get(meta.adsetId) : null;
      if (!adRowsByCampaign.has(localCampaignId)) adRowsByCampaign.set(localCampaignId, []);
      adRowsByCampaign.get(localCampaignId).push({
        adId: meta.adId,
        adName: insight?.ad_name || meta.adName,
        adsetId: meta.adsetId,
        adsetName: insight?.adset_name || adset?.adsetName || null,
        delivery: meta.delivery,
        imageFilename: meta.imageFilename,
        adsetBudget: adset?.budget ?? null,
        adsetBudgetType: adset?.budgetType || null,
        endTime: adset?.endTime || null,
        qualityRanking: insight?.quality_ranking || null,
        engagementRanking: insight?.engagement_rate_ranking || null,
        conversionRanking: insight?.conversion_rate_ranking || null,
        hasInsights: !!insight,
        ...(insight ? normalizeInsightRow(insight) : emptyInsightRow())
      });
    }

    // Se reescribe para TODAS las campañas sincronizadas — no sólo las que
    // trajeron filas — para que no sobrevivan objetos de una ventana previa.
    for (const localCampaignId of localIdByExternal.values()) {
      const bySpend = (a, b) => (b.spend || 0) - (a.spend || 0);
      const adsetRows = (adsetRowsByCampaign.get(localCampaignId) || []).sort(bySpend);
      const adRows = (adRowsByCampaign.get(localCampaignId) || []).sort(bySpend);
      await db('campaigns').where({ id: localCampaignId }).update({
        meta_adsets_insights: adsetRows.length ? JSON.stringify(adsetRows) : null,
        meta_ads_insights: adRows.length ? JSON.stringify(adRows) : null
      });
      summary.adsetInsights += adsetRows.length;
      summary.adInsights += adRows.length;
    }

    return summary;
  }

  /**
   * `/insights` con reintento: el juego completo de campos varía por cuenta y
   * por versión del Graph, y Meta rechaza la petición entera si uno solo no
   * está disponible. Antes que quedarse sin métricas, se reintenta con el
   * juego mínimo.
   */
  /**
   * `/insights` de un nivel, indexado por el id del objeto. Si Meta falla se
   * anota en el resumen y se sigue con un mapa vacío: el panel prefiere
   * mostrar la jerarquía sin métricas antes que no mostrar nada.
   */
  /**
   * Huso horario de la cuenta publicitaria: es el que decide qué día es "hoy"
   * para Meta, y puede no ser el del servidor. Se cachea por instancia porque
   * no cambia entre sincronizaciones.
   */
  async #accountTimezoneOffset(account) {
    if (this._tzOffsetHours != null) return this._tzOffsetHours;
    try {
      const info = await this.#graphGet(account, { fields: 'timezone_offset_hours_utc' });
      this._tzOffsetHours = Number(info.timezone_offset_hours_utc || 0);
    } catch {
      this._tzOffsetHours = 0; // ante la duda, UTC: peor es quedarse sin métricas
    }
    return this._tzOffsetHours;
  }

  /**
   * Parámetros de ventana para `/insights`. Se traduce el preset a un
   * `time_range` que **incluye hoy** (ver `PRESET_DAYS`); `maximum` se deja
   * como preset porque no tiene equivalente en fechas.
   */
  async #timeParams(account, datePreset) {
    const days = PRESET_DAYS[datePreset];
    if (!days) return { date_preset: datePreset };
    const offset = await this.#accountTimezoneOffset(account);
    const now = Date.now();
    return {
      time_range: JSON.stringify({
        since: dayInAccountTz(now - (days - 1) * 86400000, offset),
        until: dayInAccountTz(now, offset)
      })
    };
  }

  async #insightsById(account, { level, timeParams, idField, fields, fallbackFields, summary, what }) {
    try {
      const rows = await this.#insights(account, { level, timeParams, fields, fallbackFields });
      return new Map(rows.filter((r) => r[idField]).map((r) => [String(r[idField]), r]));
    } catch (err) {
      summary.errors.push(`No se pudieron traer las métricas de ${what}: ${err.message}`);
      return new Map();
    }
  }

  async #insights(account, { level, timeParams, fields, fallbackFields }) {
    const params = { level, ...timeParams, limit: '500' };
    try {
      return await this.#graphGet(`${account}/insights`, { ...params, fields });
    } catch (err) {
      if (!fallbackFields) throw err;
      console.warn(`⚠️ [Meta Ads] Campos completos rechazados en level=${level} (${err.message}); se reintenta con el juego mínimo.`);
      return this.#graphGet(`${account}/insights`, { ...params, fields: fallbackFields });
    }
  }
}
