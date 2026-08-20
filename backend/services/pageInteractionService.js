import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/**
 * Persistencia de las interacciones (comentarios, reacciones, publicaciones,
 * compartidos) recibidas del campo "feed" del webhook de Meta.
 */
export class PageInteractionService {
  async createFromFeedChange(pageId, value) {
    const [id] = await db('page_interactions').insert({
      page_id: pageId || value.from?.id || null,
      item_type: value.item || 'desconocido',
      verb: value.verb || null,
      post_id: value.post_id || null,
      comment_id: value.comment_id || null,
      sender_id: value.from?.id || null,
      sender_name: value.from?.name || null,
      message: value.message || null,
      reaction_type: value.reaction_type || null,
      raw_value: JSON.stringify(value),
      event_time: value.created_time ? new Date(value.created_time * 1000) : null
    });

    if (value.post_id) {
      this.ensurePostCached(value.post_id).catch((error) => {
        console.error(`❌ [Meta Webhook] Error al cachear el post ${value.post_id}:`, error);
      });
    }

    return this.getById(id);
  }

  /**
   * Consulta y cachea la miniatura/mensaje/enlace de un post la primera vez
   * que se referencia, para no volver a pedirlo a la Graph API en cada
   * comentario o reacción sobre el mismo post.
   */
  async ensurePostCached(postId) {
    const existing = await db('page_posts').where({ post_id: postId }).first();
    if (existing) return existing;

    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) return null;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${postId}?fields=message,full_picture,permalink_url&access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Meta Webhook] Error al obtener los datos del post desde la Graph API:', data);
      return null;
    }

    await db('page_posts')
      .insert({
        post_id: postId,
        message: data.message || null,
        picture_url: data.full_picture || null,
        permalink_url: data.permalink_url || null
      })
      .onConflict('post_id')
      .ignore();

    return db('page_posts').where({ post_id: postId }).first();
  }

  async getById(id) {
    return db('page_interactions').where({ id }).first();
  }

  async getRecent({ limit = 50, itemType = null } = {}) {
    const query = db('page_interactions as pi')
      .leftJoin('page_posts as pp', 'pp.post_id', 'pi.post_id')
      .select(
        'pi.*',
        'pp.picture_url as post_picture_url',
        'pp.message as post_message',
        'pp.permalink_url as post_permalink_url'
      )
      .orderBy('pi.received_at', 'desc')
      .limit(limit);
    if (itemType) query.where('pi.item_type', itemType);
    return query;
  }

  async getStats() {
    const rows = await db('page_interactions')
      .select('item_type')
      .count('* as total')
      .groupBy('item_type');

    const stats = { total: 0, byType: {} };
    for (const row of rows) {
      const count = Number(row.total);
      stats.byType[row.item_type] = count;
      stats.total += count;
    }
    return stats;
  }
}
