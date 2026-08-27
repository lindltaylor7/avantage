import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'project-updates');
fs.mkdirSync(uploadDir, { recursive: true });

const financeReceiptDir = path.join(__dirname, '..', '..', 'uploads', 'finance-receipts');
fs.mkdirSync(financeReceiptDir, { recursive: true });

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

const financeReceiptUpload = multer({
  storage: financeReceiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('El comprobante debe ser una imagen.'));
  }
}).single('receipt');

/**
 * Middleware para rutas de Finanzas: sube (opcionalmente) una única imagen de
 * comprobante en el campo "receipt" y normaliza los errores de multer a JSON.
 */
export function uploadFinanceReceipt(req, res, next) {
  financeReceiptUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Error al subir el comprobante: ' + err.message });
    }
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

export { financeReceiptDir };
