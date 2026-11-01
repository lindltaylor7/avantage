/**
 * De dónde salió un lead, contestado en UN solo sitio.
 *
 * La pregunta parece trivial y no lo es: la respuesta vive repartida en tres
 * juegos de columnas que escriben tres caminos distintos (el formulario de
 * Meta, el formulario de TikTok y el clic que abre WhatsApp), más el texto
 * libre de `leads.source` para todo lo que no viene de un anuncio. Cada
 * pantalla que lo resolvía por su cuenta llegaba a una respuesta distinta, y
 * así es como la exportación de marketing acabó marcando como "Meta" hasta los
 * leads de TikTok.
 *
 * Es puro y no toca la base: recibe la fila del lead y devuelve su origen
 * normalizado. Lo que no se sabe viaja en `null` y la pantalla escribe "sin
 * dato" — nunca se rellena con un valor plausible, que es exactamente el error
 * que hacía pasar por Meta lo que no era de Meta.
 *
 * Los IDs se devuelven como **texto**: son números de 15 a 17 dígitos y
 * cualquier paso por `Number` les cambia los últimos dígitos o los convierte
 * en notación científica, con lo que el cruce contra el Administrador de
 * anuncios deja de cerrar.
 */

/** Los cinco valores de "Plataforma" que lee la hoja de marketing. */
export const PLATFORMS = {
  meta: 'Meta',
  tiktok: 'TikTok',
  organico: 'Orgánico',
  referido: 'Referido',
  otro: 'Otro'
};

/** Los tres valores de "Canal". */
export const CHANNELS = {
  form: 'Formulario',
  whatsapp: 'WhatsApp',
  dm: 'Mensaje directo'
};

const text = (value) => {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out ? out : null;
};

const flat = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Facebook o Instagram, que es lo que distingue el campo `platform` del lead de
 * Meta ("fb" / "ig"). No es la plataforma de la hoja —esa es "Meta" en los dos
 * casos— sino la red donde la persona vio el anuncio, y se guarda porque es lo
 * que permite comparar el rendimiento de las dos.
 */
export function metaNetwork(value) {
  const key = flat(value);
  if (!key) return null;
  if (key === 'ig' || key.includes('instagram')) return 'Instagram';
  if (key === 'fb' || key.includes('facebook')) return 'Facebook';
  if (key.includes('messenger')) return 'Messenger';
  if (key.includes('audience')) return 'Audience Network';
  return null;
}

/**
 * Plataforma y canal de lo que NO vino de un anuncio: ahí lo único que hay es
 * el texto de `leads.source`, que lo escribe cada camino de alta (el webhook
 * de WhatsApp pone "WhatsApp Directo", el evaluador "Chatbot Web", el alta
 * manual lo que eligió quien cargó la ficha).
 *
 * "Meta" NO es el valor por defecto de nada: lo que no se reconoce es "Otro",
 * porque un lead cuyo origen no se sabe tiene que poder contarse como tal en
 * vez de abultar la cuenta de una plataforma que quizá no lo trajo.
 */
function fromSourceText(source) {
  const key = flat(source);

  if (!key) return { platform: PLATFORMS.otro, channel: CHANNELS.dm, network: null };

  if (key.includes('tiktok')) return { platform: PLATFORMS.tiktok, channel: CHANNELS.dm, network: 'TikTok' };
  if (key.includes('referid') || key.includes('recomendac')) {
    return { platform: PLATFORMS.referido, channel: CHANNELS.dm, network: null };
  }
  // Un lead cuyo `source` dice "Facebook Ads" o "Instagram Ads" pero que no
  // tiene una sola columna de atribución es un lead de Meta sin anuncio
  // identificado: la plataforma se sabe, el anuncio no. Decir "Orgánico"
  // sería tan falso como inventarle una campaña.
  if (key.includes(' ads') || key.includes('meta ads')) {
    return { platform: PLATFORMS.meta, channel: CHANNELS.form, network: metaNetwork(key) };
  }
  if (key.includes('whatsapp')) return { platform: PLATFORMS.organico, channel: CHANNELS.whatsapp, network: null };
  if (key.includes('instagram') || key.includes('messenger') || key.includes('facebook')) {
    return { platform: PLATFORMS.organico, channel: CHANNELS.dm, network: metaNetwork(key) };
  }
  // El evaluador público de viabilidad y el formulario de la web.
  if (key.includes('chatbot') || key.includes('web') || key.includes('evaluador') || key.includes('formulario')) {
    return { platform: PLATFORMS.organico, channel: CHANNELS.form, network: null };
  }
  if (key.includes('presencial') || key.includes('base fria') || key.includes('llamada') || key.includes('manual')) {
    return { platform: PLATFORMS.organico, channel: CHANNELS.dm, network: null };
  }

  return { platform: PLATFORMS.otro, channel: CHANNELS.dm, network: null };
}

/**
 * El origen de un lead, normalizado.
 *
 * El orden de las preguntas es el orden de certeza: primero las columnas que
 * escribió la propia plataforma al dar de alta el lead (un `tiktok_lead_id` no
 * se escribe por accidente), y el texto de `source` al final, que es lo único
 * que puede haber tecleado una persona.
 *
 * `paid` es "¿esto salió de un anuncio?" y de él cuelga qué columnas de la hoja
 * son obligatorias. Un clic desde una PUBLICACIÓN de Meta (`source_type:
 * 'post'`) es de Meta y no es pagado: tiene plataforma y no tiene campaña.
 */
export function leadOrigin(lead = {}) {
  const tiktokAdId = text(lead.tiktok_ad_id);
  const tiktokLeadId = text(lead.tiktok_lead_id);

  if (tiktokAdId || tiktokLeadId) {
    return {
      platform: PLATFORMS.tiktok,
      network: 'TikTok',
      channel: CHANNELS.form,
      paid: !!tiktokAdId,
      campaignId: text(lead.tiktok_campaign_id),
      campaignName: text(lead.tiktok_campaign_name),
      adsetId: text(lead.tiktok_adgroup_id),
      adsetName: text(lead.tiktok_adgroup_name),
      adId: tiktokAdId,
      adName: text(lead.tiktok_ad_name),
      formId: text(lead.tiktok_page_id),
      headline: null,
      platformLeadId: tiktokLeadId,
      enteredAt: lead.tiktok_created_time || lead.created_at || null
    };
  }

  const metaAdId = text(lead.meta_ad_id);
  const metaLeadgenId = text(lead.meta_leadgen_id);

  if (metaAdId || metaLeadgenId || text(lead.meta_form_id)) {
    return {
      platform: PLATFORMS.meta,
      network: metaNetwork(lead.meta_platform),
      channel: CHANNELS.form,
      paid: !!metaAdId,
      campaignId: text(lead.meta_campaign_id),
      campaignName: text(lead.meta_campaign_name),
      adsetId: text(lead.meta_adset_id),
      adsetName: text(lead.meta_adset_name),
      adId: metaAdId,
      adName: text(lead.meta_ad_name),
      formId: text(lead.meta_form_id),
      headline: null,
      platformLeadId: metaLeadgenId,
      enteredAt: lead.meta_created_time || lead.created_at || null
    };
  }

  const ctwaAdId = text(lead.ctwa_ad_id);
  const ctwaClid = text(lead.ctwa_clid);
  const ctwaType = flat(lead.ctwa_source_type);

  if (ctwaAdId || ctwaClid || ctwaType) {
    return {
      platform: PLATFORMS.meta,
      network: null,
      channel: CHANNELS.whatsapp,
      // Una publicación orgánica también manda `referral`, y ahí no hay
      // campaña que pedir ni costo que repartir.
      paid: ctwaType === 'ad' && !!ctwaAdId,
      campaignId: null,
      campaignName: null,
      adsetId: null,
      adsetName: null,
      adId: ctwaType === 'post' ? null : ctwaAdId,
      adName: null,
      formId: null,
      headline: text(lead.ctwa_headline),
      // El click id es con lo que Meta reconoce esta conversación: hace el
      // papel del `leadgen_id` de un formulario.
      platformLeadId: ctwaClid,
      enteredAt: lead.ctwa_created_time || lead.created_at || null
    };
  }

  const guess = fromSourceText(lead.source);
  return {
    platform: guess.platform,
    network: guess.network,
    channel: guess.channel,
    paid: false,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    adsetName: null,
    adId: null,
    adName: null,
    formId: null,
    headline: null,
    platformLeadId: null,
    enteredAt: lead.created_at || null
  };
}

/**
 * El "ID de origen" con el que se enlaza todo, igual que lo escribe la
 * plataforma: dígitos y nada más.
 *
 * Dentro del CRM el id de un anuncio de TikTok viaja con el prefijo `tt:`
 * porque `campaign_ads.ad_source_id` es ÚNICA y la comparten las dos
 * plataformas (los dos ids son numéricos y podrían chocar). Ese prefijo es un
 * detalle interno: en la hoja de marketing tiene que salir el id pelado, que
 * es lo que se compara dígito por dígito contra el Ads Manager.
 */
export function bareSourceId(sourceId) {
  const value = text(sourceId);
  if (!value) return null;
  return value.startsWith('tt:') ? value.slice(3) : value;
}

/**
 * El `referral` del primer mensaje de WhatsApp, convertido a las columnas del
 * lead.
 *
 * Meta manda ese objeto cuando la conversación nació de un clic en un anuncio
 * (o en una publicación) y lo reenvían tanto el webhook nativo como YCloud,
 * con las claves en snake_case. Se admiten las dos grafías porque el proveedor
 * normaliza algunas: lo que no se puede es perder el dato por el nombre de la
 * clave.
 *
 * Devuelve `{}` cuando no hay nada que guardar, para poder esparcirlo sobre el
 * alta sin ensuciarla con nulos.
 */
export function ctwaAttribution(referral, { receivedAt = null } = {}) {
  if (!referral || typeof referral !== 'object') return {};

  const sourceType = text(referral.source_type ?? referral.sourceType);
  const sourceId = text(referral.source_id ?? referral.sourceId);
  const clid = text(referral.ctwa_clid ?? referral.ctwaClid);
  if (!sourceId && !clid) return {};

  return {
    // Solo un anuncio tiene id de anuncio: el `source_id` de una publicación
    // orgánica es el id del post, y escribirlo acá lo haría pasar por pagado.
    ctwaAdId: sourceType === 'ad' && sourceId ? sourceId.slice(0, 40) : null,
    ctwaClid: clid ? clid.slice(0, 255) : null,
    ctwaSourceType: sourceType ? sourceType.slice(0, 20) : null,
    ctwaHeadline: text(referral.headline)?.slice(0, 255) || null,
    ctwaCreatedTime: receivedAt || new Date()
  };
}

/**
 * ¿Este lead no dejó un solo dato más que su número?
 *
 * Meta cuenta como conversación iniciada cualquier clic que abre el chat, así
 * que su total siempre va a ser mayor que el del CRM (624 contra 382 en el
 * corte del 31/10/2026). Parte de esa diferencia es gente que escribió "hola"
 * y nunca contestó nada, y parte es pérdida real — sin separarlas, la brecha
 * no se puede explicar ni corregir.
 *
 * El criterio es "no hay nada que trabajar": sin nombre propio (el marcador
 * genérico que le pone el bot a un contacto sin perfil no cuenta), sin correo,
 * sin documento, sin universidad y sin informe de viabilidad.
 */
export function onlyGreeted(lead = {}, { genericName = null } = {}) {
  const name = text(lead.full_name);
  const hasName = !!name && (!genericName || name !== genericName);
  const hasScore = lead.overall_viability_score !== null && lead.overall_viability_score !== undefined;

  return !hasName
    && !text(lead.email)
    && !text(lead.dni)
    && !text(lead.university)
    && !hasScore;
}

/** Las columnas de `leads` que hacen falta para resolver el origen. */
export const LEAD_ORIGIN_COLUMNS = [
  'source',
  'created_at',
  'meta_leadgen_id', 'meta_form_id', 'meta_ad_id', 'meta_adset_id', 'meta_campaign_id',
  'meta_platform', 'meta_created_time',
  'meta_ad_name', 'meta_adset_name', 'meta_campaign_name',
  'tiktok_lead_id', 'tiktok_page_id', 'tiktok_ad_id', 'tiktok_adgroup_id', 'tiktok_campaign_id',
  'tiktok_created_time',
  'tiktok_ad_name', 'tiktok_adgroup_name', 'tiktok_campaign_name',
  'ctwa_ad_id', 'ctwa_clid', 'ctwa_source_type', 'ctwa_headline', 'ctwa_created_time'
];
