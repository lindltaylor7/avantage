import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Vista previa PARCIAL de un entregable retenido.
 *
 * El cliente tiene que poder ver *que* el avance existe y de qué va, sin
 * llevarse el documento antes de pagar. Por eso la vista previa nunca es el
 * archivo: se arma en el servidor y de acá solo sale un extracto corto
 * (`PREVIEW_CHAR_LIMIT` caracteres del texto) o, para las imágenes, los
 * primeros bytes — lo justo para que el navegador dibuje la franja superior.
 * Lo que no se manda no se puede recuperar del lado del cliente, que es
 * justamente el punto de tener el entregable bloqueado.
 *
 * Todo se extrae con lo que trae Node (`zlib`): nada de binarios nativos,
 * porque el hosting compartido no los soporta.
 */

/** Caracteres de texto que se muestran antes del corte. */
export const PREVIEW_CHAR_LIMIT = 900;

/** Porción del archivo que se manda cuando la vista previa es una imagen. */
export const IMAGE_PREVIEW_RATIO = 0.35;
const IMAGE_PREVIEW_MIN_BYTES = 24 * 1024;

/** Tope de lectura: un adjunto enorme no puede comerse la memoria del proceso. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/** Texto suficiente para llenar el extracto aunque el inicio venga sucio. */
const MAX_EXTRACTED_CHARS = 6000;

const IMAGE_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

const PLAIN_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.log', '.rtf'];

/**
 * Qué extractor le toca al archivo. Se mira primero la extensión porque el
 * mime que manda el navegador al subir es poco confiable (muchos .docx llegan
 * como `application/octet-stream`).
 */
export function resolveAttachmentKind(mimeType, originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === '.docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === '.odt' || mime.includes('opendocument.text')) return 'odt';
  if (IMAGE_MIME_BY_EXT[ext] || mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (PLAIN_EXTENSIONS.includes(ext) || mime.startsWith('text/')) return 'plain';
  return null;
}

function imageMime(mimeType, originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (IMAGE_MIME_BY_EXT[ext]) return IMAGE_MIME_BY_EXT[ext];
  return String(mimeType || '').toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

// -------------------------------------------------------------------- TEXTO

/** Deja el texto extraído legible: sin controles, sin sangrías raras ni huecos. */
export function normalizeExtractedText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t\u00A0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Corta en el último espacio antes del límite: la vista previa termina en una
 * palabra entera y no a mitad de una, que se lee como archivo corrupto.
 */
export function cutExcerpt(text, limit = PREVIEW_CHAR_LIMIT) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const lastBreak = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  return (lastBreak > limit * 0.6 ? slice.slice(0, lastBreak) : slice).trimEnd();
}

/**
 * Descarta extracciones fallidas: un PDF escaneado o con fuentes de subconjunto
 * devuelve glifos sin sentido, y es preferible decir "no se puede previsualizar"
 * antes que mostrarle basura al cliente.
 */
export function looksLikeReadableText(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (compact.length < 30) return false;
  const letters = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  return letters / compact.length >= 0.6;
}

// ---------------------------------------------------------------------- PDF

/** Decodifica una cadena literal `(...)` de PDF (escapes y octales incluidos). */
function decodePdfLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    i += 1;
    if (next >= '0' && next <= '7') {
      let octal = next;
      while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') {
        octal += raw[i + 1];
        i += 1;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      continue;
    }
    if (next === '\n') continue;
    const escapes = { n: '\n', r: '\n', t: '\t', b: '', f: '' };
    out += escapes[next] !== undefined ? escapes[next] : next;
  }
  return out;
}

/** Las cadenas en UTF-16BE llevan BOM; el resto se lee como latin-1. */
function decodePdfBytes(chars) {
  if (chars.charCodeAt(0) === 0xfe && chars.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < chars.length; i += 2) {
      out += String.fromCharCode((chars.charCodeAt(i) << 8) | chars.charCodeAt(i + 1));
    }
    return out;
  }
  return chars;
}

function decodePdfHex(hex) {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return decodePdfBytes(out);
}

const PDF_ARRAY_PARTS = /\(((?:\\.|[^()\\])*)\)|<([0-9A-Fa-f\s]*)>|(-?\d+(?:\.\d+)?)/g;
const PDF_TEXT_OPS =
  /\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^()\\])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]*)>\s*Tj|(T\*|Td|TD|ET)/g;

/**
 * Texto de un content stream ya descomprimido (operadores Tj / TJ / ').
 *
 * Un PDF no guarda párrafos: guarda fragmentos colocados en coordenadas. Como
 * acá no se rastrea la posición, cada reubicación se lee como un espacio: el
 * adelanto sale como un párrafo corrido en vez de como una columna de palabras
 * sueltas, que es como quedaba al cortar línea en cada fragmento.
 */
function textFromPdfContent(content) {
  let out = '';
  const push = (chunk) => {
    if (!chunk) return;
    if (chunk === ' ' && /\s$/.test(out)) return;
    out += chunk;
  };

  let match;
  PDF_TEXT_OPS.lastIndex = 0;
  while ((match = PDF_TEXT_OPS.exec(content)) !== null) {
    if (match[1] !== undefined) {
      let part;
      PDF_ARRAY_PARTS.lastIndex = 0;
      while ((part = PDF_ARRAY_PARTS.exec(match[1])) !== null) {
        if (part[1] !== undefined) push(decodePdfBytes(decodePdfLiteral(part[1])));
        else if (part[2] !== undefined) push(decodePdfHex(part[2]));
        // Un desplazamiento grande entre glifos es un espacio que el PDF no escribe.
        else if (Number(part[3]) <= -120) push(' ');
      }
      push(' ');
    } else if (match[2] !== undefined) {
      push(decodePdfBytes(decodePdfLiteral(match[2])));
      push(' ');
    } else if (match[3] !== undefined) {
      push(decodePdfHex(match[3]));
      push(' ');
    } else {
      push(' ');
    }
  }
  return out;
}

function inflateQuiet(chunk) {
  for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      return inflate(chunk);
    } catch {
      /* el stream no era Flate: se prueba el siguiente */
    }
  }
  return null;
}

/** Recorre los `stream ... endstream` del PDF en el orden en que aparecen. */
function* pdfStreams(buffer) {
  const open = Buffer.from('stream', 'latin1');
  const close = Buffer.from('endstream', 'latin1');
  let index = buffer.indexOf(open);
  while (index !== -1) {
    let start = index + open.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;
    const end = buffer.indexOf(close, start);
    if (end === -1) return;
    yield buffer.subarray(start, end);
    index = buffer.indexOf(open, end + close.length);
  }
}

export function extractPdfText(buffer) {
  let text = '';
  for (const stream of pdfStreams(buffer)) {
    const content = (inflateQuiet(stream) || stream).toString('latin1');
    if (!content.includes('Tj') && !content.includes('TJ')) continue;
    text += textFromPdfContent(content);
    if (text.length >= MAX_EXTRACTED_CHARS) break;
  }
  return text;
}

/** Número de páginas declarado en el catálogo (solo para mostrárselo al cliente). */
export function countPdfPages(buffer) {
  const head = buffer.toString('latin1');
  const declared = head.match(/\/Count\s+(\d+)/g);
  if (declared?.length) {
    return Math.max(...declared.map((entry) => Number(entry.replace(/\D/g, '')) || 0)) || null;
  }
  return head.match(/\/Type\s*\/Page[^s]/g)?.length || null;
}

// --------------------------------------------------------------- ZIP (docx)

/**
 * Saca una entrada de un ZIP leyendo su directorio central. Un .docx (y un
 * .odt) es un ZIP: con `zlib.inflateRawSync` alcanza para leer el XML del
 * documento sin sumar una dependencia de descompresión.
 */
export function readZipEntry(buffer, entryName) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 20 > buffer.length) return null;

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(data);
      try {
        return zlib.inflateRawSync(data);
      } catch {
        return null;
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Convierte el XML del documento en texto plano (un párrafo por línea). */
export function textFromDocumentXml(xml) {
  return decodeXmlEntities(
    String(xml)
      .replace(/<\/(w:p|text:p|text:h)>/g, '\n')
      .replace(/<(w:br|w:tab|text:line-break|text:tab)\b[^>]*\/?>/g, ' ')
      .replace(/<[^>]+>/g, '')
  );
}

export function extractZipDocumentText(buffer) {
  const xml = readZipEntry(buffer, 'word/document.xml') || readZipEntry(buffer, 'content.xml');
  return xml ? textFromDocumentXml(xml.toString('utf8')) : '';
}

// ------------------------------------------------------------------ PÚBLICO

/**
 * Arma la vista previa del adjunto de un avance. Nunca lanza: si el archivo no
 * se puede leer o el formato no da texto, devuelve `kind: 'none'` con el
 * motivo que se le muestra al cliente.
 */
export async function buildAttachmentPreview({ filePath, mimeType, originalName }) {
  let stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch {
    return { kind: 'none', reason: 'El archivo ya no está disponible en el servidor.' };
  }

  const kind = resolveAttachmentKind(mimeType, originalName);
  if (kind === 'image') {
    return { kind: 'image', mime: imageMime(mimeType, originalName), size: stats.size };
  }
  if (!kind) {
    return { kind: 'none', reason: 'Este tipo de archivo no se puede previsualizar desde el portal.', size: stats.size };
  }
  if (stats.size > MAX_SOURCE_BYTES) {
    return { kind: 'none', reason: 'El documento es demasiado pesado para previsualizarlo.', size: stats.size };
  }

  let buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch {
    return { kind: 'none', reason: 'El archivo ya no está disponible en el servidor.', size: stats.size };
  }

  let text = '';
  let pages = null;
  try {
    if (kind === 'pdf') {
      text = extractPdfText(buffer);
      pages = countPdfPages(buffer);
    } else if (kind === 'docx' || kind === 'odt') {
      text = extractZipDocumentText(buffer);
    } else {
      text = buffer.subarray(0, 64 * 1024).toString('utf8');
    }
  } catch (error) {
    console.error('❌ Error al extraer la vista previa del adjunto:', error.message);
    text = '';
  }

  const normalized = normalizeExtractedText(text);
  if (!looksLikeReadableText(normalized)) {
    return {
      kind: 'none',
      reason: 'Este documento no permite generar una vista previa (puede ser un escaneo o una imagen).',
      pages,
      size: stats.size
    };
  }

  const excerpt = cutExcerpt(normalized);
  return {
    kind: 'text',
    excerpt,
    truncated: excerpt.length < normalized.length,
    chars: normalized.length,
    pages,
    size: stats.size
  };
}

/**
 * Primeros bytes de una imagen: el navegador dibuja la franja de arriba y deja
 * el resto sin pintar. Es la vista previa "a medias" del caso imagen, y el
 * resto del archivo nunca sale del servidor.
 */
export async function readImagePreviewBytes(filePath) {
  const stats = await fs.promises.stat(filePath);
  const length = Math.min(stats.size, Math.max(IMAGE_PREVIEW_MIN_BYTES, Math.round(stats.size * IMAGE_PREVIEW_RATIO)));
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const chunk = Buffer.alloc(length);
    const { bytesRead } = await handle.read(chunk, 0, length, 0);
    // El marcador de fin de imagen ayuda a que el decodificador dibuje lo que
    // sí llegó, en vez de descartar el archivo por venir cortado.
    return Buffer.concat([chunk.subarray(0, bytesRead), Buffer.from([0xff, 0xd9])]);
  } finally {
    await handle.close();
  }
}
