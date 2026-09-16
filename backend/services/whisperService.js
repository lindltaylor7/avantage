import fs from 'fs';
import path from 'path';

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Transcripción de audio con la API de Whisper de OpenAI. Se usa para los
 * audios/notas de voz que llegan por WhatsApp: sin esto, el bot los ignora
 * por completo (solo procesa mensajes de texto) y la conversación se queda
 * "colgada" sin que el contacto sepa por qué.
 *
 * No requiere ninguna librería nueva: la API acepta un simple POST
 * multipart/form-data, igual que el envío de adjuntos que ya hace
 * whatsappMessageService.sendMediaMessage().
 */
export class WhisperService {
  get apiKey() {
    return process.env.OPENAI_API_KEY || '';
  }

  get isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Transcribe un archivo de audio ya descargado en disco. Devuelve el texto
   * transcrito, o null si no hay API key configurada, el audio no se pudo
   * transcribir, o la transcripción salió vacía (audio en silencio/ruido).
   */
  async transcribe(filePath, mimeType) {
    if (!this.isConfigured) return null;
    if (!fs.existsSync(filePath)) return null;

    try {
      const buffer = await fs.promises.readFile(filePath);
      const form = new FormData();
      form.append('model', 'whisper-1');
      // Los contactos de este negocio escriben en español; fijar el idioma
      // evita que Whisper "adivine" mal con audios cortos o con ruido.
      form.append('language', 'es');
      form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), path.basename(filePath));

      const response = await fetch(WHISPER_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`⚠️ [Whisper] Error al transcribir (${response.status}): ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await response.json();
      const text = (data.text || '').trim();
      return text || null;
    } catch (error) {
      console.warn('⚠️ [Whisper] Excepción al transcribir audio:', error.message);
      return null;
    }
  }
}
