import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/**
 * Servicio de integración real con la Meta Graph API para Instagram Business.
 * Extrae directamente el perfil (@username, seguidores, biografía), publicaciones,
 * comentarios, menciones y mensajes de la cuenta conectada.
 */
export class InstagramService {
  /**
   * Resuelve y descubre automáticamente el ID de la cuenta de Instagram Business
   * vinculada a la Página de Facebook usando el Page Access Token.
   */
  async resolveInstagramAccountId(pageAccessToken) {
    if (process.env.META_INSTAGRAM_ACCOUNT_ID) {
      return process.env.META_INSTAGRAM_ACCOUNT_ID.trim();
    }

    try {
      // 1. Probar consultando directamente /me (si el token es de la Página)
      const urlMe = `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(pageAccessToken)}`;
      const resMe = await fetch(urlMe);
      const dataMe = await resMe.json();

      if (resMe.ok && dataMe.instagram_business_account?.id) {
        return dataMe.instagram_business_account.id;
      }

      // 2. Probar consultando /me/accounts (si el token contiene listado de páginas)
      const urlAccounts = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(pageAccessToken)}`;
      const resAccounts = await fetch(urlAccounts);
      const dataAccounts = await resAccounts.json();

      if (resAccounts.ok && Array.isArray(dataAccounts.data)) {
        for (const page of dataAccounts.data) {
          if (page.instagram_business_account?.id) {
            return page.instagram_business_account.id;
          }
        }
      }
    } catch (err) {
      console.error('❌ [Instagram Service] Error al resolver el ID de cuenta de Instagram:', err);
    }

    return null;
  }

  /**
   * Obtiene la información real del perfil de Instagram Business desde la Graph API.
   */
  async getProfile() {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;

    if (!pageAccessToken) {
      return {
        connected: false,
        error: 'META_PAGE_ACCESS_TOKEN no está configurado en el archivo .env',
        username: null,
        name: null,
        followers_count: 0,
        follows_count: 0,
        media_count: 0,
        biography: null,
        website: null
      };
    }

    try {
      const igAccountId = await this.resolveInstagramAccountId(pageAccessToken);

      if (!igAccountId) {
        return {
          connected: false,
          error: 'No se encontró una cuenta de Instagram Business vinculada a la Página de Facebook en Meta.',
          username: null,
          name: null,
          followers_count: 0,
          follows_count: 0,
          media_count: 0
        };
      }

      const fields = 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website';
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igAccountId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('❌ [Instagram Service] Error en Graph API al obtener perfil:', data);
        return {
          connected: false,
          error: data.error?.message || 'Error al consultar la Graph API de Instagram.',
          username: null
        };
      }

      return {
        connected: true,
        id: data.id,
        username: data.username,
        name: data.name || data.username,
        profile_picture_url: data.profile_picture_url || null,
        followers_count: data.followers_count || 0,
        follows_count: data.follows_count || 0,
        media_count: data.media_count || 0,
        biography: data.biography || '',
        website: data.website || ''
      };
    } catch (err) {
      console.error('❌ [Instagram Service] Excepción al obtener perfil:', err);
      return {
        connected: false,
        error: err.message,
        username: null
      };
    }
  }

  /**
   * Obtiene publicaciones y reels reales de Instagram directamente desde la Graph API.
   */
  async getMedia(limit = 12) {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) return [];

    try {
      const igAccountId = await this.resolveInstagramAccountId(pageAccessToken);
      if (!igAccountId) return [];

      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igAccountId}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(pageAccessToken)}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && Array.isArray(data.data)) {
        return data.data;
      } else {
        console.error('❌ [Instagram Service] Error en Graph API al obtener media:', data);
      }
    } catch (err) {
      console.error('❌ [Instagram Service] Excepción al obtener media:', err);
    }

    return [];
  }

  /**
   * Obtiene la lista de interacciones reales de Instagram:
   * 1. Extrae comentarios reales de los posts desde la Graph API.
   * 2. Incluye eventos entrantes recibidos en el Webhook de Meta.
   */
  async getInteractions({ limit = 50, itemType = null } = {}) {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    const allInteractions = [];

    // 1. Extraer comentarios reales directamente de las publicaciones de Instagram vía Graph API
    if (pageAccessToken) {
      try {
        const mediaItems = await this.getMedia(10);
        
        for (const post of mediaItems) {
          const urlComments = `https://graph.facebook.com/${GRAPH_API_VERSION}/${post.id}/comments?fields=id,text,timestamp,username,like_count&limit=20&access_token=${encodeURIComponent(pageAccessToken)}`;
          const resComments = await fetch(urlComments);
          const dataComments = await resComments.json();

          if (resComments.ok && Array.isArray(dataComments.data)) {
            for (const comment of dataComments.data) {
              allInteractions.push({
                id: comment.id,
                item_type: 'comment',
                sender_name: comment.username || 'usuario_ig',
                sender_id: comment.username || comment.id,
                message: comment.text,
                post_id: post.id,
                post_message: post.caption || 'Publicación de Instagram',
                post_permalink_url: post.permalink || null,
                received_at: comment.timestamp || new Date().toISOString()
              });
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ [Instagram Service] Error al extraer comentarios vía Graph API:', err.message);
      }
    }

    // 2. Extraer interacciones de Instagram registradas en la base de datos (Webhooks de Meta)
    try {
      const dbQuery = db('page_interactions as pi')
        .leftJoin('page_posts as pp', 'pp.post_id', 'pi.post_id')
        .select(
          'pi.*',
          'pp.picture_url as post_picture_url',
          'pp.message as post_message',
          'pp.permalink_url as post_permalink_url'
        )
        .where(function() {
          this.where('pi.raw_value', 'like', '%instagram%')
            .orWhere('pi.item_type', 'like', '%ig%')
            .orWhere('pi.item_type', 'comment');
        })
        .orderBy('pi.received_at', 'desc')
        .limit(limit);

      if (itemType) {
        dbQuery.where('pi.item_type', itemType);
      }

      const dbInteractions = await dbQuery;
      
      // Combinar evitando duplicados por ID
      const existingIds = new Set(allInteractions.map(i => String(i.id)));
      for (const item of dbInteractions) {
        if (!existingIds.has(String(item.id))) {
          allInteractions.push(item);
          existingIds.add(String(item.id));
        }
      }
    } catch (err) {
      console.warn('⚠️ [Instagram Service] Error al consultar DB:', err.message);
    }

    // Ordenar por fecha más reciente
    allInteractions.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

    if (itemType) {
      return allInteractions.filter(i => i.item_type === itemType).slice(0, limit);
    }

    return allInteractions.slice(0, limit);
  }

  /**
   * Calcula métricas reales basadas en el perfil y las interacciones extraídas.
   */
  async getStats() {
    const profile = await this.getProfile();
    const interactions = await this.getInteractions({ limit: 100 });

    const comments = interactions.filter(i => i.item_type === 'comment').length;
    const dms = interactions.filter(i => i.item_type === 'direct_message' || i.item_type === 'message').length;
    const mentions = interactions.filter(i => i.item_type === 'mention' || i.item_type === 'story_reply').length;
    const reactions = interactions.filter(i => i.item_type === 'reaction' || i.item_type === 'like').length;

    return {
      total: interactions.length,
      comments,
      dms,
      mentions,
      reactions,
      followers: profile.followers_count || 0
    };
  }
}
