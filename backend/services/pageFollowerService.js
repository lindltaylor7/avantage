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
      throw new Error('META_PAGE_ACCESS_TOKEN no está configurado en el servidor.');
    }

    // Nota: "fan_count" fue retirado de la Graph API (Meta lo reemplazó por
    // "followers_count"); pedirlo ahora responde el error (#100) "Tried
    // accessing nonexisting field".
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,followers_count&access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      const reason = data?.error?.message || JSON.stringify(data);
      console.error('❌ [Meta Followers] Error al consultar la Graph API:', data);
      throw new Error(`Graph API rechazó la solicitud: ${reason}`);
    }

    const [id] = await db('page_follower_snapshots').insert({
      page_id: data.id,
      page_name: data.name || null,
      followers_count: data.followers_count ?? null
    });

    console.log(`👥 [Meta Followers] Snapshot guardado: ${data.name || data.id} — followers_count=${data.followers_count}`);
    return db('page_follower_snapshots').where({ id }).first();
  }

  async getLatest() {
    return db('page_follower_snapshots').orderBy('captured_at', 'desc').first();
  }

  async getHistory({ limit = 100 } = {}) {
    return db('page_follower_snapshots').orderBy('captured_at', 'desc').limit(limit);
  }
}
