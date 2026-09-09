import { db } from '../db/connection.js';

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

/** Suma las conversaciones de mensajería iniciadas del arreglo `actions`. */
function extractMessagingStarted(actions) {
  if (!Array.isArray(actions)) return 0;
  const types = new Set([
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_conversation_started_7d'
  ]);
  return actions
    .filter((a) => types.has(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

function toDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

/**
 * Integración con la Meta Marketing API: importa las campañas de Ads, mapea
 * automáticamente sus anuncios (para atribuir el tráfico Click-to-WhatsApp por
 * `referral.source_id`) y trae las métricas de rendimiento (gasto, impresiones,
 * alcance, clics, CPM, CPC, CTR y conversaciones de mensajería iniciadas).
 */
export class MetaAdsService {
  constructor({ fetchImpl } = {}) {
    this.fetch = fetchImpl || globalThis.fetch;
  }

  get accountId() {
    return normalizeAccountId(process.env.META_ADS_ACCOUNT_ID);
  }

  get accessToken() {
    return process.env.META_ADS_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || null;
  }

  isConfigured() {
    return !!(this.accountId && this.accessToken);
  }

  status() {
    const id = this.accountId;
    return {
      configured: this.isConfigured(),
      accountId: id ? id.replace(/^(act_\d{3})\d+(\d{3})$/, '$1…$2') : null,
      hasToken: !!this.accessToken,
      usingPageToken: !process.env.META_ADS_ACCESS_TOKEN && !!process.env.META_PAGE_ACCESS_TOKEN
    };
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
    if (!this.isConfigured()) {
      const e = new Error('Falta configurar META_ADS_ACCOUNT_ID y un token con permiso ads_read (META_ADS_ACCESS_TOKEN o META_PAGE_ACCESS_TOKEN).');
      e.code = 'NOT_CONFIGURED';
      throw e;
    }

    const account = this.accountId;
    const summary = { campaigns: 0, adsMapped: 0, insightsUpdated: 0, datePreset, errors: [] };

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

    // 2) Anuncios -> mapeo automático (ad.id === referral.source_id de WhatsApp)
    let ads = [];
    try {
      ads = await this.#graphGet(`${account}/ads`, {
        fields: 'id,name,campaign_id,effective_status',
        limit: '500'
      });
    } catch (err) {
      summary.errors.push(`No se pudieron traer los anuncios: ${err.message}`);
    }

    for (const ad of ads) {
      const localCampaignId = localIdByExternal.get(String(ad.campaign_id));
      if (!localCampaignId) continue;
      await db('campaign_ads')
        .insert({ campaign_id: localCampaignId, ad_source_id: String(ad.id), ad_label: ad.name || null })
        .onConflict('ad_source_id')
        .merge({ campaign_id: localCampaignId, ad_label: ad.name || null });
      summary.adsMapped++;
    }

    // 3) Métricas por campaña
    try {
      const insights = await this.#graphGet(`${account}/insights`, {
        level: 'campaign',
        date_preset: datePreset,
        fields: 'campaign_id,impressions,reach,clicks,spend,cpm,cpc,ctr,actions,date_start,date_stop',
        limit: '500'
      });

      for (const row of insights) {
        const localCampaignId = localIdByExternal.get(String(row.campaign_id));
        if (!localCampaignId) continue;
        const meta_insights = {
          impressions: Number(row.impressions || 0),
          reach: Number(row.reach || 0),
          clicks: Number(row.clicks || 0),
          spend: Number(row.spend || 0),
          cpm: row.cpm != null ? Number(row.cpm) : null,
          cpc: row.cpc != null ? Number(row.cpc) : null,
          ctr: row.ctr != null ? Number(row.ctr) : null,
          messagingStarted: extractMessagingStarted(row.actions),
          window: datePreset,
          dateStart: row.date_start || null,
          dateStop: row.date_stop || null
        };
        await db('campaigns').where({ id: localCampaignId }).update({
          meta_insights: JSON.stringify(meta_insights),
          last_synced_at: db.fn.now()
        });
        summary.insightsUpdated++;
      }
    } catch (err) {
      summary.errors.push(`No se pudieron traer las métricas: ${err.message}`);
    }

    return summary;
  }
}
