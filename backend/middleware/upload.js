import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Este módulo lee process.env.UPLOADS_DIR apenas se importa (más abajo), así
// que no puede depender de que server.js ya haya llamado dotenv.config() —
// el orden de ejecución de imports de ES modules no lo garantiza. Mismo
// patrón defensivo que ya usa emailService.js.
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Carpeta base de todo lo que el sistema guarda en disco (comprobantes,
 * adjuntos de proyectos, medios de WhatsApp, etc.). Por defecto vive dentro
 * del propio repo (`uploads/`, como siempre), pero en producción con
 * despliegue automático por Git (Hostinger) eso es un problema: esa carpeta
 * nunca se versiona (ver .gitignore) y cada deploy deja el directorio de la
 * app tal cual está en el repo, así que el contenido no versionado se pierde.
 *
 * `UPLOADS_DIR` permite apuntar esta carpeta a una ruta ABSOLUTA fuera de la
 * raíz que gestiona el despliegue por Git, para que sobreviva a cada deploy —
 * ver la nota "Persistencia de uploads entre despliegues" en README.md.
 */
const uploadsBase = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

const uploadDir = path.join(uploadsBase, 'project-updates');
fs.mkdirSync(uploadDir, { recursive: true });

const financeReceiptDir = path.join(uploadsBase, 'finance-receipts');
fs.mkdirSync(financeReceiptDir, { recursive: true });

// Copias locales de las miniaturas de posts de Facebook/Instagram (sus URLs
// firmadas de Meta caducan a las pocas horas), descargadas bajo demanda.
const socialPostImageDir = path.join(uploadsBase, 'social-posts');
fs.mkdirSync(socialPostImageDir, { recursive: true });

// Copias locales de los adjuntos (imagen/video/audio/documento) que un
// contacto envía por WhatsApp: el link de descarga que da Meta o YCloud
// caduca, así que se descargan una sola vez apenas llega el webhook.
const whatsappMediaDir = path.join(uploadsBase, 'whatsapp-media');
fs.mkdirSync(whatsappMediaDir, { recursive: true });

// Copia local del thumbnail/imagen del creativo del primer anuncio de cada
// campaña de Meta Ads (para reconocerla de un vistazo en el panel) — el
// thumbnail_url/image_url que da la Marketing API es una URL firmada que
// caduca, así que se descarga una sola vez en cada sincronización.
const campaignAdImageDir = path.join(uploadsBase, 'campaign-ads');
fs.mkdirSync(campaignAdImageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
}).single('attachment');

/**
 * Middleware listo para usar en rutas: sube (opcionalmente) un único archivo
 * en el campo "attachment" y normaliza los errores de multer a JSON.
 */
export function uploadProjectUpdateAttachment(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Error al subir el archivo adjunto: ' + err.message });
    }
    next();
  });
}

export { uploadDir };

const financeReceiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, financeReceiptDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

// Máximo de comprobantes que se pueden adjuntar de una sola vez a un registro
// de Finanzas (ingreso o asiento del libro diario).
export const MAX_FINANCE_RECEIPTS = 10;

const financeReceiptMulter = multer({
  storage: financeReceiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por archivo
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype || '';
    if (mime.startsWith('image/') || mime === 'application/pdf') return cb(null, true);
    cb(new Error('El comprobante debe ser una imagen o un PDF.'));
  }
});

// Un registro admite varios comprobantes, pero se siguen aceptando las
// peticiones antiguas que mandan uno solo en el campo "receipt".
const financeReceiptUpload = financeReceiptMulter.fields([
  { name: 'receipts', maxCount: MAX_FINANCE_RECEIPTS },
  { name: 'receipt', maxCount: MAX_FINANCE_RECEIPTS }
]);

/**
 * Middleware para rutas de Finanzas: sube (opcionalmente) uno o varios
 * comprobantes (imágenes o PDF) y los deja normalizados en `req.receipts`
 * (array, posiblemente vacío). Los errores de multer se devuelven como JSON.
 */
export function uploadFinanceReceipt(req, res, next) {
  financeReceiptUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Error al subir el comprobante: ' + err.message });
    }
    req.receipts = [...(req.files?.receipts || []), ...(req.files?.receipt || [])];
    next();
  });
}

const financeFileUpload = multer({
  storage: financeReceiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB — cualquier tipo de archivo
}).single('file');

/**
 * Middleware para rutas de Finanzas que aceptan un archivo o imagen de
 * cualquier tipo (p. ej. la constancia tributaria de un ingreso), en el
 * campo "file".
 */
export function uploadFinanceFile(req, res, next) {
  financeFileUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Error al subir el archivo: ' + err.message });
    }
    next();
  });
}

export { financeReceiptDir, socialPostImageDir, whatsappMediaDir, campaignAdImageDir };
