import { db } from '../db/connection.js';
import {
  normalizeFieldKey,
  extractMetaLeadForm,
  formatCustomFieldsNote
} from './metaLeadFields.js';

/**
 * Importación de los leads de **formulario instantáneo de TikTok** (TikTok
 * Lead Generation) al CRM.
 *
 * Es la hermana de `metaLeadReconciliationService.js`, y existe por el mismo
 * agujero visto desde el otro lado. En Meta el problema era que el webhook
 * perdía leads en silencio y la conciliación los iba a buscar; acá **no hay
 * webhook en absoluto**: los leads de TikTok se quedan en el Centro de
 * clientes potenciales de TikTok y el CRM nunca se entera de que existen. El
 * caso que destapó esto (30/10/2026): la campaña "TT | WA | Asesor | 27Oct"
 * marcaba 21 conversiones en el Ads Manager y la trazabilidad de Campañas
 * decía "todavía no hay contactos atribuidos a esta campaña".
 *
 * Tres decisiones que conviene no deshacer:
 *
 *  1. **Las respuestas se leen con el MISMO extractor que las de Meta**
 *     (`extractMetaLeadForm` en `metaLeadFields.js`). Las dos plataformas
 *     tienen exactamente el mismo problema —el nombre de cada pregunta no es
 *     estable, es el texto que escribió el equipo convertido a slug— y ahí ya
 *     están resueltas las reglas que costaron casos reales: la universidad se
 *     resuelve antes que el nombre ("¿cuál es el nombre de tu universidad?"),
 *     un documento nunca entra como celular aunque su pregunta diga "número",
 *     y una respuesta de 9 dígitos o más que no sea documento se toma como
 *     celular se llame como se llame la pregunta. Copiarlas acá sería tener
 *     dos extractores que, el día que alguien corrija uno, dirán cosas
 *     distintas según de qué plataforma venga el lead.
 *  2. **La importación es explícita, no automática.** Igual que el `POST` de
 *     la conciliación de Meta: traer leads agrega gente al funnel que el
 *     equipo va a trabajar y a repartir, así que no puede ser el efecto de
 *     abrir una pantalla. El `GET` solo reporta.
 *  3. **Un lead ya importado no se vuelve a dar de alta.** La llave es
 *     `leads.tiktok_lead_id` (más el marcador en las notas, para la ficha que
 *     se colgó de otra por teléfono), así que correr la importación dos veces
 *     no duplica a nadie.
 *
 * Lo que TikTok NO da, y por qué el flujo es tan raro: no existe un endpoint
 * que devuelva los leads de un formulario de una. Hay que pedir una **tarea
 * de descarga**, esperar a que TikTok la prepare y bajarse el archivo. Por eso
 * esto es un botón que tarda unos segundos y no una llamada más.
 */

/** Cuántas veces se le pregunta a TikTok si la descarga ya está lista. */
const TASK_POLL_ATTEMPTS = 20;
const TASK_POLL_INTERVAL_MS = 1500;

/** Tope de formularios que se recorren en una corrida. */
const MAX_FORMS = 100;

/*
 * `page/get/` topa el tamaño de página en 100 y rechaza cualquier cosa mayor
 * con "page_size: number must be most 100" — que es un error de VALIDACIÓN y
 * no de permisos, aunque leído rápido parezca lo segundo. El paginador que se
 * comparte con el servicio de anuncios usa 1000 por defecto, que es lo que
 * aceptan `campaign/get/`, `adgroup/get/` y `ad/get/`, así que acá hay que
 * pedir el propio.
 */
const FORMS_PAGE_SIZE = 100;

/*
 * Cómo se crea la tarea de descarga, en orden de probabilidad.
 *
 * El portal de documentación de TikTok es una aplicación JavaScript que no se
 * puede leer de forma programática, así que la ruta exacta no se pudo fijar de
 * antemano. Lo que sí se sabe es el patrón del resto de la familia —los
 * endpoints de lead de prueba son `page/lead/mock/create/` y
 * `page/lead/mock/delete/`, con el verbo como segmento propio— y lo que
 * contestó la cuenta real el 30/10/2026: `GET page/lead/task/` devolvió 405
 * ("existe, pero no por este método") y 404.
 *
 * Por eso se prueban las variantes en vez de adivinar una: la que funciona se
 * recuerda en la instancia, así que esto cuesta un intento la primera vez y
 * cero en todas las demás. Y si fallan todas, el error las lista con su
 * estado HTTP, que es lo que permite arreglarlo en una sola vuelta en vez de
 * seguir probando a ciegas.
 */
const TASK_CREATE_VARIANTS = [
  { path: 'page/lead/task/create/', method: 'POST' },
  { path: 'page/lead/task/', method: 'POST' },
  { path: 'page/lead/task/', method: 'GET' }
];

/** Lo mismo para consultar si la tarea ya está lista. */
const TASK_CHECK_VARIANTS = [
  { path: 'page/lead/task/check/', method: 'GET' },
  { path: 'page/lead/task/', method: 'GET' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * Códigos y frases con las que TikTok dice "este token no puede hacer esto".
 * Hacen falta porque el aviso de "falta el scope de Lead Generation" sólo
 * sirve si el error ES de permisos: colgado de cualquier fallo mandaba a
 * reautorizar la app por un `page_size` inválido (caso real del 30/10/2026),
 * que es el peor consejo posible — se pierde media hora rehaciendo el OAuth
 * para volver al mismo error.
 */
const PERMISSION_CODES = new Set([40001, 40002, 40100, 40102, 40105, 40110]);
const PERMISSION_TEXT_RE = /permission|permiso|not authoriz|unauthoriz|scope|access denied|no autoriz/i;

/**
 * ¿Este fallo es "la ruta no es esa" y no "la llamada estaba mal"?
 *
 * Solo 404 (no existe) y 405 (existe pero no por este método) justifican
 * probar la variante siguiente. Un error de permisos, de parámetros o de la
 * cuenta tiene que propagarse tal cual: reintentarlo contra otra ruta lo
 * convierte en un 404 engañoso y esconde el error que de verdad hay que leer.
 */
export function isRoutingError(error) {
  return error?.httpStatus === 404 || error?.httpStatus === 405;
}

export function looksLikePermissionError(error) {
  return PERMISSION_CODES.has(Number(error?.tiktokCode))
    || PERMISSION_TEXT_RE.test(String(error?.message || ''));
}

/**
 * Las columnas del archivo de leads que son METADATOS y no respuestas del
 * formulario. Se reconocen por patrón y no por su nombre exacto por la misma
 * razón que las preguntas: TikTok devuelve las cabeceras en el idioma de la
 * cuenta, así que "Fecha de creación" y "Create Time" son la misma columna.
 */
const META_COLUMNS = [
  ['leadId', /^(lead id|id del cliente potencial|id de cliente potencial)$/],
  ['createdTime', /^(create time|created time|createtime|submission time|fecha de creacion|hora de creacion|fecha de envio)$/],
  ['adId', /^(ad id|id del anuncio)$/],
  ['adgroupId', /^(adgroup id|ad group id|id del grupo de anuncios)$/],
  ['campaignId', /^(campaign id|id de la campana|id de campana)$/],
  ['pageId', /^(page id|id de la pagina|id del formulario)$/]
];

/** Qué metadato es esta cabecera, o null si es una pregunta del formulario. */
export function metaColumnFor(header) {
  const key = normalizeFieldKey(header);
  for (const [field, re] of META_COLUMNS) {
    if (re.test(key)) return field;
  }
  return null;
}

/**
 * Parser de CSV con comillas: TikTok entrega el archivo de leads como CSV y
 * una respuesta de texto libre puede traer comas, comillas y saltos de línea
 * dentro del campo. Partir por `split(',')` rompe justamente en el lead cuya
 * respuesta era interesante, así que se parsea de verdad.
 *
 * Devuelve filas como objetos `{ cabecera: valor }`, con la cabecera tal cual
 * vino (normalizarla es trabajo de quien la lee).
 */
export function parseLeadCsv(text) {
  const raw = String(text || '').replace(/^﻿/, '');
  if (!raw.trim()) return [];

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (quoted) {
      if (ch === '"') {
        // Dos comillas seguidas dentro de un campo entrecomillado son una
        // comilla literal, no el final del campo.
        if (raw[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((cells) => cells.some((c) => String(c).trim()))
    .map((cells) => {
      const obj = {};
      header.forEach((name, idx) => { obj[String(name).trim()] = String(cells[idx] ?? '').trim(); });
      return obj;
    });
}

/**
 * Una fila del archivo (o un objeto del JSON, que algunas cuentas devuelven en
 * vez del CSV) convertida a la forma que entiende `persistTikTokLead`.
 *
 * Todo lo que no es metadato se trata como respuesta del formulario y viaja
 * con la MISMA forma que el `field_data` de Meta (`{ name, values: [] }`),
 * que es lo que permite reusar el extractor de aquel lado sin adaptadores.
 */
export function leadFromRow(row, { pageId = null } = {}) {
  const out = { leadId: null, createdTime: null, adId: null, adgroupId: null, campaignId: null, pageId, fieldData: [] };

  for (const [name, value] of Object.entries(row || {})) {
    const text = value == null ? '' : String(value).trim();
    const meta = metaColumnFor(name);
    if (meta) {
      // El `page_id` que viene en el archivo gana sobre el del formulario que
      // se estaba recorriendo: son el mismo dato, pero el del archivo es el
      // que TikTok afirma.
      if (text) out[meta] = text;
      continue;
    }
    if (!text) continue;
    out.fieldData.push({ name, values: [text] });
  }

  return out;
}

/**
 * La fecha que manda TikTok, en algo que `new Date()` entienda.
 *
 * Llega de tres formas según el endpoint y la cuenta: segundos de epoch,
 * milisegundos, o "2026-10-27 14:05:31" en el huso del anunciante. Esa última
 * la lee `Date` como hora LOCAL del servidor, que es lo que queremos: el
 * backend corre en el huso de Lima, el mismo de la cuenta.
 */
export function parseTikTokTime(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();

  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^\d{13}$/.test(text)) return new Date(Number(text));

  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Da de alta (o cuelga de la ficha que ya existe) un lead de formulario de
 * TikTok. Es `persistMetaLead` para la otra plataforma y se mantiene como
 * **camino único**: la importación y cualquier cosa que venga después —un
 * webhook el día que TikTok lo ofrezca, una carga manual del CSV— tienen que
 * entrar por acá, o las dos mitades de la misma tabla dejan de ser
 * comparables.
 */
export async function persistTikTokLead(leadService, data) {
  const leadId = String(data.leadId || '');
  const form = extractMetaLeadForm(data.fieldData);

  /*
   * El marcador se escribe en las notas aunque el `lead_id` ya tenga su propia
   * columna: es lo que hace legible la ficha para el equipo (el mismo estilo
   * que el `[Meta leadgen_id=...]`) y lo que permite reconocer estos leads si
   * alguna vez hay que rehacer la columna.
   */
  const notesParts = [`[TikTok lead_id=${leadId}] page_id=${data.pageId || 'desconocido'}`];
  const customNote = formatCustomFieldsNote(form);
  if (customNote) notesParts.push(customNote);

  const phone = form.phone || '';
  if (!phone) {
    // Mismo aviso que en Meta y por lo mismo: un lead de formulario sin
    // celular no se puede llamar ni cruzar contra la ficha que ya exista, así
    // que queda escrito qué preguntas SÍ vinieron — es con lo que se corrige
    // el formulario (o el extractor) sin reproducir el caso.
    const keys = (data.fieldData || []).map((item) => item.name).join(', ') || 'ninguna';
    console.warn(`⚠️ [TikTok Leads] El lead ${leadId} llegó sin celular. Preguntas recibidas: ${keys}`);
  }

  const atribucion = {
    leadId: leadId || null,
    pageId: data.pageId || null,
    adId: data.adId || null,
    adgroupId: data.adgroupId || null,
    campaignId: data.campaignId || null,
    createdTime: data.createdTime || null
  };

  /*
   * Una persona es un lead, no uno por cada formulario que llena. Acá pesa
   * todavía más que en Meta: estas campañas corren a la vez que las de Meta
   * sobre el mismo público, así que el contacto que ya escribió por WhatsApp
   * y además llenó el formulario de TikTok es el caso normal.
   */
  const existente = phone ? await leadService.findByPhone(phone) : null;
  if (existente) {
    const lead = await leadService.attachTikTokLeadToExisting(existente, {
      ...atribucion,
      note: notesParts.join('\n')
    });
    return { lead, created: false };
  }

  const lead = await leadService.createProspect({
    fullName: form.fullName || 'Prospecto de TikTok',
    email: form.email || '',
    phone,
    dni: form.dni,
    source: 'TikTok Ads',
    academicLevel: form.academicLevel,
    university: form.university,
    fieldOfStudy: form.fieldOfStudy,
    // Igual que el de Meta: esta persona llenó un formulario pero todavía no
    // habló con nadie, así que arranca en el Setter Funnel y no "gradúa" al
    // Funnel de Ventas.
    status: 'conversacion_abierta',
    additionalNotes: notesParts.join('\n'),
    tiktokLeadId: atribucion.leadId,
    tiktokPageId: atribucion.pageId,
    tiktokAdId: atribucion.adId,
    tiktokAdgroupId: atribucion.adgroupId,
    tiktokCampaignId: atribucion.campaignId,
    tiktokCreatedTime: atribucion.createdTime
  });

  return { lead, created: true };
}

export class TikTokLeadsService {
  /**
   * @param {object} deps
   * @param {import('./tiktokAdsService.js').TikTokAdsService} deps.ads servicio
   *   de TikTok Ads: aporta el token, la versión de la API, el anunciante y el
   *   tratamiento de los errores que TikTok devuelve dentro de un HTTP 200.
   * @param {object} deps.leadService
   */
  constructor({ ads, leadService, fetchImpl } = {}) {
    this.ads = ads;
    this.leadService = leadService;
    this.fetch = fetchImpl || ((...args) => globalThis.fetch(...args));
  }

  /** Base de la API, la misma versión que usa el servicio de anuncios. */
  get apiBase() {
    return `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION || 'v1.3'}`;
  }

  /**
   * Los formularios instantáneos de la cuenta.
   *
   * Si TikTok no deja listarlos —el permiso de Lead Generation es propio y el
   * token puede no tenerlo— se cae a los `page_id` que ya figuran en el CRM,
   * exactamente como hace la conciliación de Meta cuando le falta
   * `pages_manage_ads`: con eso se pueden seguir trayendo leads de los
   * formularios conocidos, que es lo que de verdad hace falta. Un formulario
   * que nunca entregó un lead queda fuera, y el aviso lo dice.
   */
  async listForms(advertiserId) {
    try {
      const list = await this.ads.apiPaged('page/get/', {
        advertiser_id: advertiserId,
        business_type: 'LEAD_GEN',
        page_size: FORMS_PAGE_SIZE
      });
      const forms = list.map((page) => ({
        id: String(page.page_id ?? page.id ?? ''),
        name: page.title || page.page_name || page.name || null,
        status: page.status || page.page_status || null
      })).filter((f) => f.id);

      if (forms.length) return { forms, source: 'tiktok', aviso: null };
      return {
        forms,
        source: 'tiktok',
        aviso: 'La cuenta no tiene ningún formulario instantáneo (Instant Page) de generación de leads.'
      };
    } catch (error) {
      const known = await this.#knownPageIds();
      if (!known.length) {
        // El consejo sólo se da cuando corresponde: ver `looksLikePermissionError`.
        const pista = looksLikePermissionError(error)
          ? ' La app necesita el scope de Lead Generation y hay que volver a autorizarla para emitir un token nuevo (README > "Traer los leads de los formularios instantáneos de TikTok").'
          : '';
        const e = new Error(`No se pudieron listar los formularios instantáneos de TikTok: ${error.message}.${pista}`);
        e.code = error.code || 'TIKTOK_PAGES_UNAVAILABLE';
        e.tiktokCode = error.tiktokCode || null;
        throw e;
      }
      console.warn(`⚠️ [TikTok Leads] No se pudieron listar los formularios (${error.message}). Se usan los ${known.length} que ya figuran en la base.`);
      return {
        forms: known.map((id) => ({ id, name: null, status: null })),
        source: 'crm',
        aviso: `No se pudieron listar los formularios desde TikTok (${error.message}). Se compararon los ${known.length} que ya tienen al menos un lead en el CRM; un formulario que nunca entregó ninguno queda fuera. Hace falta el permiso de Lead Generation en el token para cubrirlos todos.`
      };
    }
  }

  /** Los `page_id` que ya tienen al menos un lead en el CRM. */
  async #knownPageIds() {
    const rows = await db('leads')
      .distinct('tiktok_page_id')
      .whereNotNull('tiktok_page_id')
      .andWhere('tiktok_page_id', '!=', '');
    return rows.map((row) => String(row.tiktok_page_id));
  }

  /**
   * Los leads de un formulario en una ventana de fechas.
   *
   * TikTok no los devuelve de una: hay que pedir una tarea de descarga,
   * esperar a que la prepare y recién entonces bajar el archivo. Los tres
   * pasos viven juntos acá para que el resto del servicio no tenga que saber
   * nada de eso.
   */
  async #fetchLeadsForPage(advertiserId, pageId, { from, to }) {
    const params = { advertiser_id: advertiserId, page_id: pageId };
    if (from) params.start_time = from;
    if (to) params.end_time = to;

    const created = await this.#callVariant('create', TASK_CREATE_VARIANTS, params, pageId);
    const taskId = created?.task_id ?? created?.taskId ?? created?.id;
    if (!taskId) {
      throw new Error(`TikTok aceptó la petición pero no devolvió el identificador de la tarea de descarga del formulario ${pageId}.`);
    }

    /*
     * La tarea tarda. Se pregunta por ella hasta `TASK_POLL_ATTEMPTS` veces y
     * se abandona con un error claro en vez de quedarse colgado: el botón que
     * dispara esto es sincrónico y del otro lado hay alguien esperando.
     */
    let state = String(created?.status ?? created?.state ?? '').toUpperCase();
    for (let attempt = 0; attempt < TASK_POLL_ATTEMPTS && !isTaskReady(state); attempt++) {
      await sleep(TASK_POLL_INTERVAL_MS);
      const check = await this.#callVariant(
        'check', TASK_CHECK_VARIANTS, { advertiser_id: advertiserId, task_id: taskId }, pageId
      );
      state = String(check?.status ?? check?.state ?? '').toUpperCase();
      if (state === 'FAILED' || state === 'FAIL') {
        throw new Error(`TikTok no pudo preparar la descarga de leads del formulario ${pageId}.`);
      }
    }
    if (!isTaskReady(state)) {
      throw new Error(`La descarga de leads del formulario ${pageId} sigue preparándose en TikTok (estado "${state || 'desconocido'}"). Volvé a intentarlo en un minuto.`);
    }

    return this.#downloadTask(advertiserId, taskId, pageId);
  }

  /**
   * Llama al primer endpoint de la lista que funcione y se queda con él.
   *
   * La ruta exacta de estos dos endpoints no se pudo fijar leyendo la
   * documentación (ver `TASK_CREATE_VARIANTS`), así que se prueban en orden.
   * Dos cuidados:
   *
   *  - Solo se pasa a la variante siguiente cuando el fallo es de RUTA (404 o
   *    405, o sea "no existe" / "no por este método"). Un error de permisos,
   *    de parámetros o de la propia cuenta se propaga tal cual: reintentarlo
   *    contra otra ruta lo convertiría en un 404 engañoso y escondería el
   *    error que de verdad hay que leer.
   *  - La que funciona se recuerda, así que el precio de esto es un intento
   *    fallido la primera vez y nada en los formularios siguientes.
   */
  async #callVariant(kind, variants, params, pageId) {
    this._endpoint ??= {};
    const lista = this._endpoint[kind] ? [this._endpoint[kind]] : variants;
    const fallos = [];

    for (const variant of lista) {
      try {
        const data = variant.method === 'POST'
          ? await this.ads.apiPost(variant.path, params)
          : await this.ads.api(variant.path, params);
        this._endpoint[kind] = variant;
        return data;
      } catch (error) {
        fallos.push(`${variant.method} ${variant.path} → ${error.message}`);
        if (!isRoutingError(error)) throw error;
      }
    }

    const e = new Error(`Ninguna ruta de descarga de leads respondió para el formulario ${pageId}. Intentos: ${fallos.join(' | ')}`);
    e.code = 'TIKTOK_LEAD_TASK_UNAVAILABLE';
    throw e;
  }

  /**
   * Baja el archivo de la tarea ya preparada.
   *
   * No pasa por `ads.api()` porque esta respuesta NO es el JSON `{code, data}`
   * del resto de la API: es el archivo. Aun así hay cuentas que devuelven el
   * JSON con la lista adentro, así que se admiten las dos formas — leer el
   * cuerpo una sola vez como texto y decidir después es más barato que
   * adivinar por el Content-Type, que TikTok no siempre manda.
   */
  async #downloadTask(advertiserId, taskId, pageId) {
    const search = new URLSearchParams({ advertiser_id: String(advertiserId), task_id: String(taskId) });
    const res = await this.fetch(`${this.apiBase}/page/lead/task/download/?${search.toString()}`, {
      headers: { 'Access-Token': this.ads.accessToken }
    });
    const text = await res.text();

    /*
     * Sin esta comprobación, un 404 del gateway (que devuelve HTML) se le
     * pasaba al parser de CSV, que no falla: devuelve filas de basura. Es el
     * peor desenlace posible — leads inventados a partir de una página de
     * error. Mejor un error claro.
     */
    if (!res.ok) {
      const e = new Error(`No se pudo descargar el archivo de leads del formulario ${pageId}: HTTP ${res.status}.`);
      e.httpStatus = res.status;
      throw e;
    }

    if (text.trim().startsWith('{')) {
      let json = {};
      try { json = JSON.parse(text); } catch { json = {}; }
      if (json.code !== undefined && json.code !== 0) {
        const e = new Error(`TikTok Business API: ${json.message || `HTTP ${res.status}`}`);
        e.tiktokCode = json.code || null;
        throw e;
      }
      const list = json.data?.list || json.data?.leads || [];
      return list.map((item) => leadFromRow(flattenJsonLead(item), { pageId }));
    }

    return parseLeadCsv(text).map((row) => leadFromRow(row, { pageId }));
  }

  /**
   * Compara lo que TikTok tiene contra lo que llegó al CRM y, si `apply`,
   * importa lo que falta.
   *
   * Mismo contrato que la conciliación de Meta a propósito: el `GET` de la
   * ruta llama con `apply: false` y solo reporta; el `POST`, con `apply: true`.
   */
  async run({ from = null, to = null, apply = false } = {}) {
    const advertiser = await this.ads.resolveAdvertiser();
    const { forms, source, aviso } = await this.listForms(advertiser.id);

    const known = await this.leadService.getKnownTikTokLeadIds();

    const report = {
      advertiser_id: advertiser.id,
      origen_formularios: source,
      aviso,
      aplicado: apply,
      ventana: { from, to },
      totals: { en_tiktok: 0, en_crm: 0, faltantes: 0, importados: 0, adjuntados: 0, fallidos: 0, sin_anuncio: 0 },
      forms: [],
      errores: []
    };

    for (const form of forms.slice(0, MAX_FORMS)) {
      const row = {
        page_id: form.id,
        nombre: form.name,
        estado: form.status,
        en_tiktok: 0,
        en_crm: 0,
        faltantes: 0,
        importados: 0,
        adjuntados: 0,
        fallidos: 0,
        ejemplos_faltantes: []
      };

      let leads = [];
      try {
        leads = await this.#fetchLeadsForPage(advertiser.id, form.id, { from, to });
      } catch (error) {
        // Un formulario que falla no puede tumbar la corrida: los otros
        // todavía pueden traer sus leads, que es para lo que se aprieta el
        // botón. El error viaja en el reporte.
        report.errores.push({ page_id: form.id, error: error.message });
        console.error(`❌ [TikTok Leads] Formulario ${form.id}:`, error.message);
        report.forms.push(row);
        continue;
      }

      for (const lead of leads) {
        if (!lead.leadId) continue;
        row.en_tiktok++;
        report.totals.en_tiktok++;

        if (known.has(String(lead.leadId))) {
          row.en_crm++;
          report.totals.en_crm++;
          continue;
        }

        row.faltantes++;
        report.totals.faltantes++;
        if (row.ejemplos_faltantes.length < 5) {
          row.ejemplos_faltantes.push({ lead_id: lead.leadId, created_time: lead.createdTime || null });
        }
        // Un lead sin `ad_id` entra igual al CRM pero no se puede acreditar a
        // ninguna campaña: se cuenta aparte para que el reporte no dé por
        // cerrada una comparación que no cerró (misma regla que `sin_anuncio`
        // en la conciliación de Meta).
        if (!lead.adId) report.totals.sin_anuncio++;

        if (!apply) continue;

        try {
          const { lead: prospect, created } = await persistTikTokLead(this.leadService, {
            ...lead,
            createdTime: parseTikTokTime(lead.createdTime)
          });
          // Conocido en el acto: si el mismo lead_id volviera a aparecer en
          // esta misma corrida (dos formularios que lo comparten), no se
          // duplica.
          known.add(String(lead.leadId));

          if (created) {
            row.importados++;
            report.totals.importados++;
          } else {
            // "Adjuntado" se cuenta aparte de "importado" porque no es lo
            // mismo para quien lee el reporte: un lead nuevo es una persona
            // más para trabajar, y un adjuntado es un formulario que se sumó a
            // una ficha que el equipo ya tenía.
            row.adjuntados++;
            report.totals.adjuntados++;
          }

          console.log(created
            ? `📥 [TikTok Leads] Lead ${lead.leadId} importado como prospecto #${prospect.id}.`
            : `🔗 [TikTok Leads] Lead ${lead.leadId} colgado del lead existente #${prospect.id} (mismo teléfono).`);
        } catch (error) {
          row.fallidos++;
          report.totals.fallidos++;
          report.errores.push({ page_id: form.id, lead_id: lead.leadId, error: error.message });
          console.error(`❌ [TikTok Leads] No se pudo importar el lead ${lead.leadId}:`, error);
        }
      }

      report.forms.push(row);
    }

    report.forms.sort((a, b) => b.faltantes - a.faltantes || b.en_tiktok - a.en_tiktok);

    /*
     * Un formulario que TikTok da por ACTIVO y del que no llegó un solo lead
     * al CRM es el síntoma de que esta importación nunca se corrió para él, y
     * se dice aparte porque en una lista larga (la mayoría de formularios
     * viejos y vacíos) no se distingue del ruido.
     */
    report.formularios_activos_sin_leads = report.forms
      .filter((f) => ['ACTIVE', 'ENABLE', 'STATUS_ENABLE'].includes(String(f.estado || '').toUpperCase()) && f.en_crm === 0)
      .map((f) => ({ page_id: f.page_id, nombre: f.nombre, en_tiktok: f.en_tiktok }));

    return report;
  }
}

/** La tarea de descarga ya está lista (TikTok no usa siempre la misma palabra). */
function isTaskReady(state) {
  return state === 'SUCCEED' || state === 'SUCCESS' || state === 'FINISHED';
}

/**
 * Un lead que vino como JSON, aplanado a `{ cabecera: valor }` para que lo lea
 * el mismo `leadFromRow` que las filas del CSV. Las respuestas vienen anidadas
 * en `field_data`/`answers` y los metadatos sueltos en la raíz.
 */
function flattenJsonLead(item) {
  const flat = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (value == null || typeof value === 'object') continue;
    flat[key] = value;
  }
  const answers = item?.field_data || item?.answers || item?.fields || [];
  for (const answer of Array.isArray(answers) ? answers : []) {
    const name = answer?.name ?? answer?.field_name ?? answer?.question ?? answer?.key;
    const value = Array.isArray(answer?.values) ? answer.values[0] : (answer?.value ?? answer?.answer);
    if (name != null && value != null && String(value).trim()) flat[String(name)] = String(value);
  }
  return flat;
}
