import fs from 'fs';
import path from 'path';
import { campaignAdImageDir } from '../middleware/upload.js';

/**
 * Caché en disco del creativo de un anuncio, compartida por las integraciones
 * de Meta Ads y TikTok Ads.
 *
 * Las dos APIs entregan la miniatura como una URL **firmada que caduca**
 * (horas, a veces minutos), así que guardarla en la base de datos no sirve de
 * nada: hay que descargar el archivo durante la sincronización. El nombre es
 * determinista por anuncio (`ad-<clave>.<ext>`) para que una resincronización
 * reutilice el archivo en vez de acumular una copia nueva cada vez; la clave
 * la elige cada servicio (Meta usa el `ad_id` tal cual, TikTok lo prefija con
 * `tt-`) para que dos plataformas no se pisen el mismo archivo.
 */

const MIME_TO_EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXTENSION_TO_MIME = Object.fromEntries(Object.entries(MIME_TO_EXTENSION).map(([mime, ext]) => [ext, mime]));

function extensionForMime(mimeType) {
  return MIME_TO_EXTENSION[String(mimeType || '').split(';')[0].trim().toLowerCase()] || 'jpg';
}

/** Imagen ya descargada de un anuncio, si la hay en disco. */
function cachedAdCreativeImage(key) {
  for (const [ext, mimeType] of Object.entries(EXTENSION_TO_MIME)) {
    const filename = `ad-${key}.${ext}`;
    if (fs.existsSync(path.join(campaignAdImageDir, filename))) return { filename, mimeType };
  }
  return null;
}

/**
 * Descarga la miniatura del creativo y la cachea. Devuelve `null` —nunca
 * lanza— si la URL no responde o no es una imagen: quedarse sin miniatura no
 * puede tumbar una sincronización de métricas.
 */
export async function downloadAdCreativeImage(imageUrl, key, { label = 'Ads' } = {}) {
  if (!imageUrl || !key) return null;
  const cached = cachedAdCreativeImage(key);
  if (cached) return cached;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;
    const filename = `ad-${key}.${extensionForMime(mimeType)}`;
    await fs.promises.writeFile(path.join(campaignAdImageDir, filename), Buffer.from(await response.arrayBuffer()));
    return { filename, mimeType };
  } catch (error) {
    console.error(`❌ [${label}] No se pudo descargar la imagen del creativo:`, error.message);
    return null;
  }
}
