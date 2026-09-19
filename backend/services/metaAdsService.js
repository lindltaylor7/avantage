import fs from 'fs';
import path from 'path';
import { db } from '../db/connection.js';
import { campaignAdImageDir } from '../middleware/upload.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const MIME_TO_EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
function extensionForMime(mimeType) {
  return MIME_TO_EXTENSION[String(mimeType || '').split(';')[0].trim().toLowerCase()] || 'jpg';
}

/**
 * Descarga el thumbnail/imagen del creativo de un anuncio y lo cachea en
 * disco. A diferencia de un post orgánico, la imagen de un anuncio se pide
 * directamente al creativo (`thumbnail_url` de la Marketing
 * API) — la mayoría de anuncios usan un "dark post" (publicación no
 * publicada en el muro), que la Graph API no deja leer como post normal
 * (`{post-id}?fields=full_picture` devuelve 404 para esos).
 */
async function downloadAdCreativeImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;
    const filename = `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForMime(mimeType)}`;
    await fs.promises.writeFile(path.join(campaignAdImageDir, filename), Buffer.from(await response.arrayBuffer()));
    return { filename, mimeType };
  } catch (error) {
    console.error('❌ [Meta Ads] No se pudo descargar la imagen del creativo:', error.message);
    return null;
  }
}

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
 * Campos de `/insights`. Meta rechaza la petición entera si un solo campo no
 * está disponible para la cuenta o la versión del Graph, así que cada nivel
 * lleva un juego reducido de respaldo con el que se reintenta.
 */
const CAMPAIGN_INSIGHT_FIELDS = 'campaign_id,objective,impressions,reach,frequency,clicks,ctr,cpc,cpm,spend,'
  + 'inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions,cost_per_action_type,'
  + 'attribution_setting,date_start,date_stop';
const CAMPAIGN_INSIGHT_FIELDS_FALLBACK = 'campaign_id,objective,impressions,reach,clicks,ctr,cpc,cpm,spend,actions,date_start,date_stop';
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
 * Integración con la Meta Marketing API: importa las campañas de Ads, mapea
 * automáticamente sus anuncios (para atribuir el tráfico Click-to-WhatsApp por
 * `referral.source_id`) y trae las métricas de rendimiento del Administrador de
 * anuncios, a nivel de campaña y desglosadas por anuncio (gasto, resultados y
 * coste por resultado, alcance, frecuencia, impresiones, CPM, clics y CTR/CPC
 * del enlace y totales, visitas a la página de destino, conversaciones de
 * mensajería iniciadas y las tres clasificaciones de calidad).
 */
export class MetaAdsService {
  constructor({ fetchImpl } = {}) {
    this.fetch = fetchImpl || globalThis.fetch;
    this._resolvedAccount = null; // cache: { id, name }
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
      return {
        configured: true,
        hasToken: true,
        usingPageToken: !process.env.META_ADS_ACCESS_TOKEN,
        accountId: account.id,
        accountName: account.name,
        accountSource: account.source,
        accountOptions: account.options || 1
      };
    } catch (err) {
      return {
        configured: false,
        hasToken: true,
        reason: (err.code || 'error').toLowerCase(),
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
   * insights de Meta (last_7d | last_30d | last_90d | maximum).
   */
  async sync({ datePreset = 'last_30d' } = {}) {
    const account = (await this.resolveAccount()).id;
    const summary = { campaigns: 0, adsMapped: 0, insightsUpdated: 0, adInsights: 0, adAccount: account, datePreset, errors: [] };

    // 1) Campañas
    const campaigns = await this.#graphGet(`${account}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,start_time,stop_time,daily_budget,lifetime_budget',
      limit: '200'
    });

    const localIdByExternal = new Map();
    for (const c of campaigns) {
      const budgetCents = Number(c.lifetime_budget || c.daily_budget || 0);
      const patch = {
        name: c.name || `Campaña ${c.id}`,
        source: 'meta',
        external_id: String(c.id),
        objective: c.objective || null,
        status: mapStatus(c.effective_status || c.status),
        meta_status: c.effective_status || c.status || null,
        start_date: toDateOnly(c.start_time),
        end_date: toDateOnly(c.stop_time),
        last_synced_at: db.fn.now(),
        updated_at: db.fn.now()
      };
      if (budgetCents > 0) patch.budget_total = Math.round(budgetCents) / 100;

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

    // 2) Anuncios -> mapeo automático. El `referral.source_id` que manda
    //    WhatsApp puede ser el ID del anuncio, el ID de la publicación detrás
    //    del anuncio (effective_object_story_id) o el ID del media de Instagram,
    //    según el tipo de anuncio. Se mapean TODOS los candidatos a la campaña.
    let ads = [];
    try {
      ads = await this.#graphGet(`${account}/ads`, {
        fields: 'id,name,campaign_id,adset_id,effective_status,creative{effective_object_story_id,effective_instagram_media_id,object_story_id,thumbnail_url}',
        limit: '500'
      });
    } catch (err) {
      summary.errors.push(`No se pudieron traer los anuncios: ${err.message}`);
    }

    const mappedSourceIds = new Set();
    // Una sola imagen por campaña — la del creativo del PRIMER anuncio con
    // thumbnail/imagen que se encuentre — para reconocer la campaña de un
    // vistazo en el panel.
    const imageSetForCampaign = new Set();
    // Nombre, entrega y conjunto de cada anuncio: `/insights?level=ad` no
    // devuelve el `effective_status`, así que se guarda de aquí y se cruza
    // después por `ad_id`.
    const adMetaById = new Map();
    for (const ad of ads) {
      adMetaById.set(String(ad.id), {
        name: ad.name || null,
        effectiveStatus: ad.effective_status || null,
        adsetId: ad.adset_id ? String(ad.adset_id) : null
      });
      const localCampaignId = localIdByExternal.get(String(ad.campaign_id));
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

      const creativeImageUrl = ad.creative?.thumbnail_url || null;
      if (creativeImageUrl && !imageSetForCampaign.has(localCampaignId)) {
        imageSetForCampaign.add(localCampaignId);
        const downloaded = await downloadAdCreativeImage(creativeImageUrl);
        if (downloaded) {
          await db('campaigns').where({ id: localCampaignId }).update({
            ad_image_filename: downloaded.filename,
            ad_image_mime_type: downloaded.mimeType
          });
        }
      }

      summary.adsMapped++;
    }

    // 3) Métricas por campaña
    try {
      const insights = await this.#insights(account, {
        level: 'campaign',
        datePreset,
        fields: CAMPAIGN_INSIGHT_FIELDS,
        fallbackFields: CAMPAIGN_INSIGHT_FIELDS_FALLBACK
      });

      for (const row of insights) {
        const localCampaignId = localIdByExternal.get(String(row.campaign_id));
        if (!localCampaignId) continue;
        await db('campaigns').where({ id: localCampaignId }).update({
          meta_insights: JSON.stringify({ ...normalizeInsightRow(row), window: datePreset }),
          last_synced_at: db.fn.now()
        });
        summary.insightsUpdated++;
      }
    } catch (err) {
      summary.errors.push(`No se pudieron traer las métricas: ${err.message}`);
    }

    // 4) Métricas por anuncio. Las tres clasificaciones (calidad, tasa de
    //    interacción y tasa de conversión) sólo existen a nivel de anuncio, y
    //    el presupuesto es del conjunto de anuncios, no del anuncio: se trae
    //    aparte y se adjunta a cada fila por `adset_id`.
    try {
      const adRows = await this.#insights(account, {
        level: 'ad',
        datePreset,
        fields: AD_INSIGHT_FIELDS,
        fallbackFields: AD_INSIGHT_FIELDS_FALLBACK
      });

      const adsetById = new Map();
      try {
        const adsets = await this.#graphGet(`${account}/adsets`, {
          fields: 'id,name,campaign_id,daily_budget,lifetime_budget,end_time',
          limit: '500'
        });
        for (const set of adsets) {
          const daily = budgetFromCents(set.daily_budget);
          const lifetime = budgetFromCents(set.lifetime_budget);
          adsetById.set(String(set.id), {
            name: set.name || null,
            budget: daily ?? lifetime,
            budgetType: daily ? 'diario' : (lifetime ? 'total' : null),
            endTime: set.end_time || null
          });
        }
      } catch (err) {
        summary.errors.push(`No se pudo traer el presupuesto de los conjuntos de anuncios: ${err.message}`);
      }

      const rowsByCampaign = new Map();
      for (const row of adRows) {
        const localCampaignId = localIdByExternal.get(String(row.campaign_id));
        if (!localCampaignId) continue;
        const adMeta = adMetaById.get(String(row.ad_id)) || {};
        const adset = adsetById.get(String(row.adset_id || adMeta.adsetId || '')) || {};
        if (!rowsByCampaign.has(localCampaignId)) rowsByCampaign.set(localCampaignId, []);
        rowsByCampaign.get(localCampaignId).push({
          adId: String(row.ad_id),
          adName: row.ad_name || adMeta.name || `Anuncio ${row.ad_id}`,
          adsetName: row.adset_name || adset.name || null,
          delivery: adMeta.effectiveStatus || null,
          adsetBudget: adset.budget ?? null,
          adsetBudgetType: adset.budgetType || null,
          endTime: adset.endTime || null,
          qualityRanking: row.quality_ranking || null,
          engagementRanking: row.engagement_rate_ranking || null,
          conversionRanking: row.conversion_rate_ranking || null,
          ...normalizeInsightRow(row)
        });
      }

      // Se reescribe para TODAS las campañas sincronizadas — no sólo las que
      // trajeron filas — para que no sobrevivan anuncios de una ventana previa.
      for (const localCampaignId of localIdByExternal.values()) {
        const rows = (rowsByCampaign.get(localCampaignId) || []).sort((a, b) => b.spend - a.spend);
        await db('campaigns').where({ id: localCampaignId }).update({
          meta_ads_insights: rows.length ? JSON.stringify(rows) : null
        });
        summary.adInsights += rows.length;
      }
    } catch (err) {
      summary.errors.push(`No se pudieron traer las métricas por anuncio: ${err.message}`);
    }

    return summary;
  }

  /**
   * `/insights` con reintento: el juego completo de campos varía por cuenta y
   * por versión del Graph, y Meta rechaza la petición entera si uno solo no
   * está disponible. Antes que quedarse sin métricas, se reintenta con el
   * juego mínimo.
   */
  async #insights(account, { level, datePreset, fields, fallbackFields }) {
    const params = { level, date_preset: datePreset, limit: '500' };
    try {
      return await this.#graphGet(`${account}/insights`, { ...params, fields });
    } catch (err) {
      if (!fallbackFields) throw err;
      console.warn(`⚠️ [Meta Ads] Campos completos rechazados en level=${level} (${err.message}); se reintenta con el juego mínimo.`);
      return this.#graphGet(`${account}/insights`, { ...params, fields: fallbackFields });
    }
  }
}
