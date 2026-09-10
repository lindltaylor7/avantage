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
    const summary = { campaigns: 0, adsMapped: 0, insightsUpdated: 0, adAccount: account, datePreset, errors: [] };

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
        fields: 'id,name,campaign_id,effective_status,creative{effective_object_story_id,effective_instagram_media_id,object_story_id}',
        limit: '500'
      });
    } catch (err) {
      summary.errors.push(`No se pudieron traer los anuncios: ${err.message}`);
    }

    const mappedSourceIds = new Set();
    for (const ad of ads) {
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
