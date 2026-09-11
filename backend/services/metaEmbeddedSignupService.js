import { db } from '../db/connection.js';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Orquesta el flujo de Embedded Signup (Facebook Login for Business) para
 * conectar un número de WhatsApp por panel, sin tocar `.env`:
 *
 *   1. El frontend abre el pop-up de Meta (FB.login) y recibe un `code` corto.
 *   2. Este servicio cambia ese `code` por un access_token (`exchangeCodeForToken`).
 *   3. Inspecciona el token con `/debug_token` para saber a qué WABA(s) da
 *      acceso realmente (nunca confiar ciegamente en lo que mande el frontend).
 *   4. Resuelve el `phone_number_id` real de esa WABA (`/{waba_id}/phone_numbers`).
 *   5. Suscribe la app a los webhooks de esa WABA (`/{waba_id}/subscribed_apps`)
 *      — sin este paso, Meta NUNCA entrega webhooks de mensajes de ese número
 *      a nuestro servidor, aunque el token y el `phone_number_id` sean válidos.
 *   6. Persiste las credenciales en `whatsapp_embedded_accounts`.
 */
export class MetaEmbeddedSignupService {
  constructor() {
    this.appId = process.env.META_APP_ID;
    this.appSecret = process.env.META_APP_SECRET;
    this.configId = process.env.META_WHATSAPP_EMBEDDED_CONFIG_ID;
  }

  /**
   * Datos que el frontend necesita para inicializar el SDK de Facebook y
   * lanzar el pop-up. El App ID y el Configuration ID NO son secretos (viajan
   * igualmente dentro del pop-up de Meta); el App Secret nunca sale del backend.
   */
  getPublicConfig() {
    return {
      appId: this.appId || null,
      configId: this.configId || null,
      graphApiVersion: GRAPH_API_VERSION
    };
  }

  assertConfigured() {
    if (!this.appId || !this.appSecret) {
      throw new Error('META_APP_ID y META_APP_SECRET deben estar configurados en el servidor.');
    }
    if (!this.configId) {
      throw new Error('META_WHATSAPP_EMBEDDED_CONFIG_ID no está configurado en el servidor.');
    }
  }

  /**
   * Llama a la Graph API y lanza un error descriptivo (incluye el cuerpo de
   * la respuesta de Meta) si no es exitosa, en vez de un genérico "fetch failed".
   */
  async graphRequest(url, { method = 'GET', body, label } = {}) {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const metaError = json?.error?.message || response.statusText;
      console.error(`❌ [Embedded Signup] ${label || 'Graph API'} falló (${response.status}):`, json?.error || json);
      throw new Error(`${label || 'Graph API'}: ${metaError}`);
    }
    return json;
  }

  /**
   * Paso 1: cambia el `code` de un solo uso por un access_token.
   *
   * A diferencia del OAuth redirect clásico, el `code` que entrega el SDK de
   * JS en el Embedded Signup NO requiere `redirect_uri` en este intercambio
   * (no hubo redirección de navegador, el pop-up corrió en el mismo origen).
   */
  async exchangeCodeForToken(code) {
    this.assertConfigured();
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('code', code);
    const json = await this.graphRequest(url.toString(), { label: 'Intercambio de code por access_token' });
    console.log('✅ [Embedded Signup] access_token obtenido, expira en', json.expires_in ?? 'N/A', 'segundos');
    return json; // { access_token, token_type, expires_in }
  }

  /**
   * Paso 2: inspecciona el token para confirmar qué WABA(s) autorizó
   * realmente el usuario. `granular_scopes` trae, por permiso, la lista de
   * `target_ids` (IDs de WABA) sobre los que aplica ese permiso.
   */
  async debugToken(accessToken) {
    this.assertConfigured();
    const appToken = `${this.appId}|${this.appSecret}`;
    const url = new URL(`${GRAPH_BASE}/debug_token`);
    url.searchParams.set('input_token', accessToken);
    url.searchParams.set('access_token', appToken);
    const json = await this.graphRequest(url.toString(), { label: 'Inspección de token (/debug_token)' });
    return json.data;
  }

  /**
   * Extrae los IDs de WABA autorizados a partir de `granular_scopes`.
   */
  extractAuthorizedWabaIds(debugTokenData) {
    const scopes = debugTokenData?.granular_scopes || [];
    const managementScope = scopes.find((s) => s.scope === 'whatsapp_business_management');
    return managementScope?.target_ids || [];
  }

  /**
   * Paso 3: obtiene los números de teléfono ya registrados bajo una WABA.
   */
  async listPhoneNumbers(wabaId, accessToken) {
    const url = new URL(`${GRAPH_BASE}/${wabaId}/phone_numbers`);
    url.searchParams.set('access_token', accessToken);
    const json = await this.graphRequest(url.toString(), { label: `Listado de números de la WABA ${wabaId}` });
    return json.data || [];
  }

  /**
   * Paso 4 (crítico): suscribe la app a los webhooks de la WABA. Cada WABA
   * conectada por Embedded Signup necesita esta llamada explícita — la
   * suscripción de webhooks a nivel de App (Meta for Developers > Webhooks)
   * solo define el endpoint global; esto es lo que efectivamente "conecta"
   * esa cuenta puntual a nuestro servidor.
   */
  async subscribeAppToWaba(wabaId, accessToken) {
    const url = new URL(`${GRAPH_BASE}/${wabaId}/subscribed_apps`);
    url.searchParams.set('access_token', accessToken);
    const json = await this.graphRequest(url.toString(), { method: 'POST', label: `Suscripción de webhooks a la WABA ${wabaId}` });
    return json.success === true;
  }

  /**
   * ⚠️ Punto crítico de coexistencia vs. migración total (#1):
   *
   * A propósito, este servicio NUNCA llama a `/{phone_number_id}/register`
   * (el paso que pide un PIN de 2 pasos y activa el número exclusivamente en
   * la Cloud API). Esa llamada es la que le indica a Meta "quiero migrar
   * completamente este número" y provoca que la app de WhatsApp Business del
   * celular se desconecte. Si en el futuro se necesita el flujo de migración
   * total, ese `register` iría en un método aparte y explícito — nunca dentro
   * del flujo de coexistencia.
   *
   * ⚠️ Punto crítico de coexistencia vs. migración total (#2):
   *
   * La decisión real ocurre ANTES, en el frontend, en los parámetros que se
   * mandan a `FB.login` (ver `WhatsAppEmbeddedSignup.vue`): el `extras`
   * `{ featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }`
   * es lo que le dice a Meta "ofrece coexistencia si el número califica"
   * (debe estar activo en la app de WhatsApp Business al momento del
   * registro). Si se omite ese `featureType`, Meta muestra el flujo estándar,
   * que termina en migración total del número a la Cloud API. Meta además
   * solo ofrece coexistencia si el número, el país y el plan del negocio son
   * elegibles — el pop-up decide esto en tiempo real y puede no mostrar la
   * opción aunque se pida.
   */
  async completeSignup({ code, wabaIdHint, phoneNumberIdHint, businessIdHint, mode = 'coexistence' }) {
    if (!code) {
      throw new Error('Falta el parámetro "code" devuelto por el pop-up de Meta.');
    }

    const tokenResponse = await this.exchangeCodeForToken(code);
    const accessToken = tokenResponse.access_token;

    const debugData = await this.debugToken(accessToken);
    const authorizedWabaIds = this.extractAuthorizedWabaIds(debugData);
    if (authorizedWabaIds.length === 0) {
      throw new Error('El token no otorgó acceso a ninguna WhatsApp Business Account (whatsapp_business_management).');
    }

    // Nunca confiar en el waba_id que mande el cliente sin verificarlo contra
    // lo que el propio token de Meta dice que autorizó.
    const wabaId = wabaIdHint && authorizedWabaIds.includes(wabaIdHint)
      ? wabaIdHint
      : authorizedWabaIds[0];

    const phoneNumbers = await this.listPhoneNumbers(wabaId, accessToken);
    if (phoneNumbers.length === 0) {
      throw new Error(`La WABA ${wabaId} no tiene ningún número de teléfono registrado todavía.`);
    }
    const phoneNumberId = phoneNumberIdHint && phoneNumbers.some((p) => p.id === phoneNumberIdHint)
      ? phoneNumberIdHint
      : phoneNumbers[0].id;

    const subscribed = await this.subscribeAppToWaba(wabaId, accessToken);

    const account = await this.saveAccount({
      wabaId,
      phoneNumberId,
      // El business_id no viaja de forma confiable en /debug_token; se toma
      // del evento postMessage WA_EMBEDDED_SIGNUP que el frontend recibe
      // durante el pop-up (ver WhatsAppEmbeddedSignup.vue). Es solo
      // informativo, no se usa para autorizar nada.
      businessId: businessIdHint || null,
      accessToken,
      tokenType: tokenResponse.token_type || null,
      expiresIn: tokenResponse.expires_in || null,
      mode,
      subscribedWebhooks: subscribed,
      debugTokenResponse: debugData
    });

    console.log(`✅ [Embedded Signup] WABA ${wabaId} / número ${phoneNumberId} conectados (modo: ${mode}, webhooks: ${subscribed ? 'suscritos' : 'NO suscritos'}).`);

    return {
      wabaId,
      phoneNumberId,
      mode,
      subscribedWebhooks: subscribed,
      accountId: account.id
    };
  }

  /**
   * Guarda (o actualiza, si la WABA ya estaba vinculada) las credenciales en
   * `whatsapp_embedded_accounts`.
   */
  async saveAccount({ wabaId, phoneNumberId, businessId, accessToken, tokenType, expiresIn, mode, subscribedWebhooks, debugTokenResponse }) {
    const existing = await db('whatsapp_embedded_accounts').where({ waba_id: wabaId }).first();
    const row = {
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      business_id: businessId,
      access_token: accessToken,
      token_type: tokenType,
      expires_in: expiresIn,
      mode,
      subscribed_webhooks: subscribedWebhooks,
      debug_token_response: JSON.stringify(debugTokenResponse || null),
      updated_at: db.fn.now()
    };
    if (existing) {
      await db('whatsapp_embedded_accounts').where({ id: existing.id }).update(row);
      return { id: existing.id, ...row };
    }
    const [id] = await db('whatsapp_embedded_accounts').insert(row);
    return { id, ...row };
  }

  /**
   * Lista las cuentas vinculadas, sin exponer el access_token al frontend.
   */
  async listAccounts() {
    const rows = await db('whatsapp_embedded_accounts')
      .select('id', 'waba_id', 'phone_number_id', 'business_id', 'mode', 'subscribed_webhooks', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');
    return rows;
  }
}
