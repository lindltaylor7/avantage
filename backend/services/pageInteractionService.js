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
      platform: 'facebook',
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
   * Guarda un comentario del campo "comments" del webhook de Instagram. Su
   * payload tiene una forma distinta a la del feed de Facebook (value.id /
   * value.text / value.media.id en vez de comment_id / message / post_id),
   * por lo que no puede reutilizar createFromFeedChange.
   */
  async createFromInstagramCommentChange(igAccountId, value, entryTime) {
    const mediaId = value.media?.id || null;

    const [id] = await db('page_interactions').insert({
      page_id: igAccountId || null,
      platform: 'instagram',
      item_type: 'comment',
      verb: null,
      post_id: mediaId,
      comment_id: value.id || null,
      sender_id: value.from?.id || null,
      sender_name: value.from?.username || null,
      message: value.text || null,
      reaction_type: null,
      raw_value: JSON.stringify(value),
      event_time: entryTime ? new Date(entryTime * 1000) : null
    });

    if (mediaId) {
      this.ensureInstagramMediaCached(mediaId).catch((error) => {
        console.error(`❌ [Instagram Webhook] Error al cachear el media ${mediaId}:`, error);
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

  /**
   * Igual que ensurePostCached pero para medios de Instagram (posts/reels),
   * cuyos campos en la Graph API difieren de los de un post de Facebook
   * (caption/media_url/permalink en vez de message/full_picture/permalink_url).
   */
  async ensureInstagramMediaCached(mediaId) {
    const existing = await db('page_posts').where({ post_id: mediaId }).first();
    if (existing) return existing;

    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) return null;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}?fields=caption,media_url,thumbnail_url,permalink&access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Instagram Webhook] Error al obtener los datos del media desde la Graph API:', data);
      return null;
    }

    await db('page_posts')
      .insert({
        post_id: mediaId,
        message: data.caption || null,
        picture_url: data.thumbnail_url || data.media_url || null,
        permalink_url: data.permalink || null
      })
      .onConflict('post_id')
      .ignore();

    return db('page_posts').where({ post_id: mediaId }).first();
  }

  async getById(id) {
    return db('page_interactions').where({ id }).first();
  }

  async getRecent({ limit = 50, itemType = null, platform = null } = {}) {
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
    if (platform) query.where('pi.platform', platform);
    return query;
  }

  async getStats({ platform = null } = {}) {
    const query = db('page_interactions')
      .select('item_type')
      .count('* as total')
      .groupBy('item_type');
    if (platform) query.where('platform', platform);
    const rows = await query;

    const stats = { total: 0, byType: {} };
    for (const row of rows) {
      const count = Number(row.total);
      stats.byType[row.item_type] = count;
      stats.total += count;
    }
    return stats;
  }
}
