import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/**
 * Sondeo periódico del conteo de seguidores de la página vía Graph API.
 * Meta no notifica los follows/unfollows en tiempo real por webhook, así que
 * esto es una aproximación por muestreo, no un evento por evento.
 */
export class PageFollowerService {
  async pollAndStore() {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) {
      console.error('❌ [Meta Followers] Falta META_PAGE_ACCESS_TOKEN, no se puede sondear el conteo de seguidores.');
      return null;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,fan_count,followers_count&access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Meta Followers] Error al consultar la Graph API:', data);
      return null;
    }

    const [id] = await db('page_follower_snapshots').insert({
      page_id: data.id,
      page_name: data.name || null,
      fan_count: data.fan_count ?? null,
      followers_count: data.followers_count ?? null
    });

    console.log(`👥 [Meta Followers] Snapshot guardado: ${data.name || data.id} — fan_count=${data.fan_count} followers_count=${data.followers_count}`);
    return db('page_follower_snapshots').where({ id }).first();
  }

  async getLatest() {
    return db('page_follower_snapshots').orderBy('captured_at', 'desc').first();
  }

  async getHistory({ limit = 100 } = {}) {
    return db('page_follower_snapshots').orderBy('captured_at', 'desc').limit(limit);
  }
}
