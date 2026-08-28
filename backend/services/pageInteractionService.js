import fs from 'fs';
import path from 'path';
import { db } from '../db/connection.js';
import { socialPostImageDir } from '../middleware/upload.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function extForMime(mime) {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Persistencia de las interacciones (comentarios, reacciones, publicaciones,
 * compartidos) recibidas del campo "feed" del webhook de Meta.
 */
export class PageInteractionService {
  async createFromFeedChange(pageId, value) {
    const verb = (value.verb || '').toLowerCase();
    const commentId = value.comment_id || null;
    const postId = value.post_id || null;
    const isRemoval = ['remove', 'hide', 'delete', 'unpublish'].includes(verb);

    // Comentario / publicación eliminado u oculto: se marca la interacción
    // original como eliminada (tachada en la tarjeta) en vez de crear otra.
    if (isRemoval && (commentId || postId)) {
      const match = db('page_interactions').whereNull('removed_at');
      if (commentId) match.where('comment_id', commentId);
      else match.where('post_id', postId).where('item_type', 'status');
      const affected = await match.update({ removed_at: db.fn.now() });
      if (affected > 0) {
        console.log(`🗑️ [Meta Webhook] Interacción marcada como eliminada (${commentId || postId}).`);
        return null;
      }
    }

    // Comentario que se vuelve a mostrar.
    if (verb === 'unhide' && commentId) {
      await db('page_interactions').where('comment_id', commentId).update({ removed_at: null });
      return null;
    }

    // Comentario editado: se actualiza el texto de la tarjeta existente.
    if ((verb === 'edited' || verb === 'edit') && commentId && value.message) {
      const affected = await db('page_interactions').where('comment_id', commentId).update({ message: value.message });
      if (affected > 0) return null;
    }

    const [id] = await db('page_interactions').insert({
      page_id: pageId || value.from?.id || null,
      platform: 'facebook',
      item_type: value.item || 'desconocido',
      verb: value.verb || null,
      post_id: postId,
      comment_id: commentId,
      sender_id: value.from?.id || null,
      sender_name: value.from?.name || null,
      message: value.message || null,
      reaction_type: value.reaction_type || null,
      removed_at: isRemoval ? db.fn.now() : null,
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

  /**
   * Devuelve una copia LOCAL de la miniatura del post (la descarga la primera
   * vez y la guarda en disco). Se usa en vez de mostrar directamente la URL
   * firmada de Meta, que caduca a las pocas horas. Devuelve
   * `{ filePath, mimeType }` o `null` si no se pudo obtener imagen.
   */
  async getCachedPostImage(postId) {
    if (!postId) return null;
    const post = await db('page_posts').where({ post_id: postId }).first();

    if (post?.local_filename) {
      const cached = path.join(socialPostImageDir, post.local_filename);
      if (fs.existsSync(cached)) {
        return { filePath: cached, mimeType: post.mime_type || 'image/jpeg' };
      }
    }

    const sourceUrl = await this._resolveFreshImageUrl(postId, post);
    if (!sourceUrl) return null;

    let response;
    try {
      response = await fetch(sourceUrl);
    } catch (error) {
      console.error(`❌ [Social] No se pudo descargar la imagen del post ${postId}:`, error.message);
      return null;
    }
    if (!response.ok) return null;

    const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;

    const filename = `${String(postId).replace(/[^A-Za-z0-9_-]/g, '_')}.${extForMime(mimeType)}`;
    const filePath = path.join(socialPostImageDir, filename);
    try {
      await fs.promises.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(`❌ [Social] No se pudo guardar la imagen del post ${postId}:`, error.message);
      return null;
    }

    await db('page_posts')
      .insert({ post_id: postId, local_filename: filename, mime_type: mimeType, fetched_at: db.fn.now() })
      .onConflict('post_id')
      .merge(['local_filename', 'mime_type', 'fetched_at']);

    return { filePath, mimeType };
  }

  /**
   * Pide a la Graph API una URL de imagen FRESCA para el post (las guardadas
   * caducan). Cae de vuelta a la URL guardada si la API falla o no hay token.
   */
  async _resolveFreshImageUrl(postId, post) {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) return post?.picture_url || null;

    const interaction = await db('page_interactions').where({ post_id: postId }).first();
    const isInstagram = interaction?.platform === 'instagram';
    const fields = isInstagram ? 'thumbnail_url,media_url' : 'full_picture';

    try {
      const r = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${postId}?fields=${fields}&access_token=${encodeURIComponent(token)}`
      );
      const d = await r.json();
      if (r.ok) {
        const fresh = isInstagram ? (d.thumbnail_url || d.media_url) : d.full_picture;
        if (fresh) {
          await db('page_posts')
            .insert({ post_id: postId, picture_url: fresh })
            .onConflict('post_id')
            .merge(['picture_url'])
            .catch(() => {});
          return fresh;
        }
      }
    } catch (error) {
      console.error(`❌ [Social] Error al pedir la imagen fresca del post ${postId}:`, error.message);
    }
    return post?.picture_url || null;
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
