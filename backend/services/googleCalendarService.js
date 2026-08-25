import { google } from 'googleapis';
import { db } from '../db/connection.js';

// Único permiso solicitado: crear/editar eventos en el calendario del
// asesor. No pedimos acceso a leer todo su calendario ni otros datos.
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'];

/**
 * Conexión OAuth de cada asesor con su propio Google Calendar, usada para
 * crear reuniones con Google Meet directamente en su calendario real.
 */
export class GoogleCalendarService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
  }

  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  createOAuthClient() {
    if (!this.isConfigured()) {
      throw new Error('Google Calendar no está configurado (faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI en el .env).');
    }
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

  /**
   * URL de consentimiento de Google para que el asesor autorice su calendario.
   * `state` viaja firmado (JWT) para identificar al usuario cuando Google
   * redirija de vuelta a /api/google/callback.
   */
  getAuthUrl(state) {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // fuerza a que Google siempre devuelva refresh_token, incluso en reconexiones
      scope: SCOPES,
      state
    });
  }

  async getConnection(userId) {
    return db('google_calendar_connections').where({ user_id: userId }).first();
  }

  async saveConnectionFromCode(userId, code) {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const existing = await this.getConnection(userId);
    const payload = {
      user_id: userId,
      google_email: userInfo.email || null,
      access_token: tokens.access_token,
      // Google solo manda refresh_token la primera vez que el usuario
      // autoriza (o si se fuerza con prompt=consent); si no viene, se
      // conserva el que ya teníamos guardado.
      refresh_token: tokens.refresh_token || existing?.refresh_token || null,
      access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope || null,
      updated_at: db.fn.now()
    };

    if (existing) {
      await db('google_calendar_connections').where({ user_id: userId }).update(payload);
    } else {
      await db('google_calendar_connections').insert(payload);
    }

    return this.getConnection(userId);
  }

  async disconnect(userId) {
    const connection = await this.getConnection(userId);
    if (!connection) return;

    try {
      const client = this.createOAuthClient();
      await client.revokeToken(connection.refresh_token || connection.access_token);
    } catch (error) {
      // La revocación puede fallar si el token ya venció o el usuario lo
      // revocó manualmente desde su cuenta de Google; no es bloqueante,
      // igual borramos la conexión guardada.
      console.warn('⚠️ [Google Calendar] No se pudo revocar el token en Google:', error.message);
    }

    await db('google_calendar_connections').where({ user_id: userId }).delete();
  }

  /**
   * Cliente OAuth2 listo para llamar la API, con refresco automático del
   * access_token (googleapis lo renueva solo si está por vencer) y persiste
   * el access_token renovado para no repetir el refresh en cada llamada.
   */
  async getAuthorizedClient(userId) {
    const connection = await this.getConnection(userId);
    if (!connection) {
      throw new Error('Este usuario no tiene conectado su Google Calendar.');
    }

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      expiry_date: connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : null
    });

    client.on('tokens', (tokens) => {
      const update = {};
      if (tokens.access_token) update.access_token = tokens.access_token;
      if (tokens.refresh_token) update.refresh_token = tokens.refresh_token;
      if (tokens.expiry_date) update.access_token_expires_at = new Date(tokens.expiry_date);
      if (Object.keys(update).length > 0) {
        update.updated_at = db.fn.now();
        db('google_calendar_connections').where({ user_id: userId }).update(update).catch((error) => {
          console.error('❌ [Google Calendar] Error al guardar el token renovado:', error);
        });
      }
    });

    return client;
  }

  /**
   * Crea un evento con Google Meet en el calendario del asesor y devuelve el
   * link de la reunión. `startTime`/`endTime` deben ser ISO 8601 con
   * timezone (ej: 2026-03-28T14:00:00-05:00).
   */
  async createMeetEvent(userId, { summary, description, startTime, endTime, attendeeEmail, timeZone = 'America/Lima' }) {
    const client = await this.getAuthorizedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { data } = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: attendeeEmail ? 'all' : 'none',
      requestBody: {
        summary,
        description,
        start: { dateTime: startTime, timeZone },
        end: { dateTime: endTime, timeZone },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
        conferenceData: {
          createRequest: {
            requestId: `avan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }
    });

    return {
      eventId: data.id,
      meetLink: data.hangoutLink || null,
      htmlLink: data.htmlLink || null,
      start: data.start,
      end: data.end
    };
  }
}
