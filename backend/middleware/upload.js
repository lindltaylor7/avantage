import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'project-updates');
fs.mkdirSync(uploadDir, { recursive: true });

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
