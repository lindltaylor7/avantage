/**
 * El aviso de que la cuenta de YCloud se quedó sin saldo.
 *
 * El 26/11/2026 a las 10:25 el bot dejó de responderle a todo el mundo y nadie
 * se enteró hasta que alguien miró una captura de pantalla. YCloud rechazaba
 * cada envío con "The account balance is insufficient" y el único rastro era
 * un `conversation_turn_failed` en el log de actividad — la misma línea que
 * deja un número inválido o un error del LLM, así que no había forma de
 * distinguir "este contacto falló" de "la cuenta no puede mandar nada".
 *
 * Y no fue un evento súbito: la cuota de 1.000 mensajes de servicio gratis del
 * mes se agotó alrededor del día 8, y el saldo estuvo 18 días bajando sin que
 * existiera ninguna señal entre "hay saldo" y "no contesta nadie".
 *
 * Esto cubre las dos mitades de ese agujero:
 *
 * 1. ANTES: un chequeo periódico del saldo avisa cuando baja del umbral,
 *    mientras todavía se puede recargar sin que ningún lead se quede esperando.
 * 2. DESPUÉS: cuando el rechazo ya pasó, se avisa UNA vez y la cuenta queda
 *    marcada como agotada, para que los barridos dejen de quemar reintentos
 *    —y reservas en la base— contra una API que va a rechazar todo hasta que
 *    alguien pague.
 *
 * El módulo no manda correos ni toca la base: recibe un `notify` inyectado
 * (igual que `whatsappOrphans` en `leadReconciliationSweep`), así que la
 * máquina de estados se prueba entera sin red.
 */

/** El endpoint de saldo cuelga de la raíz de la v2, no de `/whatsapp`. */
const YCLOUD_API_ROOT = 'https://api.ycloud.com/v2';

/** `error.code` de YCloud para el rechazo por saldo (HTTP 403). */
export const BALANCE_ERROR_CODE = 'BALANCE_INSUFFICIENT';

/**
 * Cuánto saldo es "poco". A ~132 salientes por día (el ritmo de noviembre de
 * 2026), 20 dólares son del orden de una semana de margen: tiempo suficiente
 * para que alguien recargue a mano, o para que un auto-recharge que falló se
 * note antes de cortar el servicio. Un umbral de 5 se evaporaría en dos días.
 */
const LOW_BALANCE_USD = Number(process.env.YCLOUD_LOW_BALANCE_USD || 20);

/** Cada cuánto se consulta el saldo. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Cada cuánto se REPITE el aviso mientras el problema sigue.
 *
 * Doce horas y no diez minutos: el correo que llega cada vuelta del barrido se
 * convierte en ruido que se filtra, y entonces el aviso no sirve justo el día
 * que importa. Una transición a peor (de "poco saldo" a "sin saldo") sí avisa
 * en el acto, sin esperar la ventana.
 */
const REALERT_MS = 12 * 60 * 60 * 1000;

const ESTADOS = { ok: 'ok', bajo: 'bajo', agotado: 'agotado' };

/** Gravedad de cada estado, para saber si el nuevo es PEOR que el anterior. */
const GRAVEDAD = { ok: 0, bajo: 1, agotado: 2 };

/**
 * ¿Este rechazo de YCloud es por falta de saldo?
 *
 * Se mira el código y también el texto porque los dos vienen distintos: la
 * documentación promete `BALANCE_INSUFFICIENT` con el mensaje "The account has
 * insufficient balance. Top up before trying again.", pero lo que llegó en
 * producción fue "The account balance is insufficient." — otra redacción, y en
 * un `message` de primer nivel en vez de dentro de `error`. Atarse a una sola
 * de las dos formas es volver a quedarse sin detectar el caso que esto existe
 * para detectar.
 *
 * Es pura: recibe el status y el cuerpo ya parseado.
 */
export function isInsufficientBalanceError(status, data) {
  const code = data?.error?.code || data?.code || '';
  if (String(code).toUpperCase() === BALANCE_ERROR_CODE) return true;

  // El 403 solo no alcanza: YCloud lo usa también para destinatario o cuenta
  // restringidos, que no se arreglan recargando.
  if (status !== 403) return false;

  const message = String(data?.message || data?.error?.message || '');
  return /insufficient\s+balance|balance\s+is\s+insufficient/i.test(message);
}

export class YCloudBalanceAlert {
  constructor({
    notify = null,
    lowBalanceUsd = LOW_BALANCE_USD,
    realertMs = REALERT_MS,
    checkIntervalMs = CHECK_INTERVAL_MS,
    now = () => Date.now()
  } = {}) {
    this.notify = notify;
    this.lowBalanceUsd = lowBalanceUsd;
    this.realertMs = realertMs;
    this.checkIntervalMs = checkIntervalMs;
    this.now = now;

    this.estado = ESTADOS.ok;
    this.lastAlertAt = null;
    this.lastCheckAt = null;
    this.lastBalance = null;
  }

  /** Quién manda el aviso. Se configura al arrancar (ver `server.js`). */
  setNotifier(notify) {
    this.notify = notify;
  }

  /**
   * ¿La cuenta está rechazando todo por saldo?
   *
   * Lo consultan los barridos para no reservar trabajo que no se va a poder
   * mandar. No se consulta antes de CADA envío: un saliente que una persona
   * dispara a mano desde el panel tiene que intentarse igual y fallar con su
   * error, porque esa persona está mirando y el error le dice qué pasa.
   */
  get agotado() {
    return this.estado === ESTADOS.agotado;
  }

  /**
   * YCloud rechazó un envío por saldo.
   *
   * No recibe el `waId` para avisar sobre ese contacto: el contacto es
   * irrelevante, lo que falló es la cuenta. Va como dato solo para que quien
   * lea el correo tenga por dónde empezar a revisar.
   */
  async noteRejection({ reason = '', waId = null } = {}) {
    this.lastBalance = 0;
    return this.#transition(ESTADOS.agotado, {
      asunto: 'WhatsApp caído: YCloud sin saldo',
      titulo: 'El bot no puede responder: la cuenta de YCloud se quedó sin saldo',
      cuerpo: [
        'YCloud está rechazando TODOS los envíos salientes de WhatsApp por falta de saldo.',
        '',
        `Respuesta de YCloud: ${reason || 'The account balance is insufficient.'}`,
        waId ? `Primer envío rechazado: ${waId}` : '',
        '',
        'Mientras tanto, cada contacto que escriba se queda sin respuesta y el bot',
        'no puede avisarle nada. Los reintentos automáticos están pausados para no',
        'gastar el único recordatorio que le toca a cada lead.',
        '',
        'Qué hacer: recargar en dashboard.ycloud.com > Settings > Billing > Recharge.',
        'La recarga es en YCloud, NO en Meta: YCloud es el proveedor (BSP) que',
        'factura los mensajes; Meta le factura a YCloud, no a nosotros.',
        '',
        'Los contactos que escribieron durante la caída se pueden recuperar hasta',
        '24 h después; pasado ese plazo WhatsApp exige plantilla aprobada.'
      ].filter((linea) => linea !== '').join('\n')
    });
  }

  /**
   * Un envío salió bien: hay saldo.
   *
   * Importa tanto como el rechazo, porque es lo que levanta la pausa de los
   * barridos sin que nadie tenga que reiniciar el proceso después de recargar.
   */
  noteSuccess() {
    if (this.estado === ESTADOS.ok) return;
    this.estado = ESTADOS.ok;
    this.lastAlertAt = null;
  }

  /**
   * Consulta el saldo si ya toca, y avisa si está bajo o agotado.
   *
   * Devuelve `null` cuando no era el momento —así quien lo llama desde el
   * temporizador de diez minutos no tiene que saber la cadencia—, igual que
   * `runIfDue()` en el barrido de conciliación.
   */
  async checkIfDue(fetchBalance = fetchYcloudBalance) {
    const ahora = this.now();
    if (this.lastCheckAt !== null && ahora - this.lastCheckAt < this.checkIntervalMs) return null;
    this.lastCheckAt = ahora;
    return this.check(fetchBalance);
  }

  async check(fetchBalance = fetchYcloudBalance) {
    const resultado = await fetchBalance();

    /*
     * Un fallo al LEER el saldo no se trata como saldo agotado. Si la API key
     * es inválida (401) o la red está caída, pausar los barridos castigaría a
     * los leads por un problema que no es de dinero — y el envío real, que es
     * el que sabe de verdad, ya tiene su propio camino de error.
     */
    if (!resultado.ok) {
      console.warn(`⚠️ [YCloud] No se pudo leer el saldo (HTTP ${resultado.status}): ${resultado.reason}`);
      return { estado: this.estado, balance: null, error: resultado.reason };
    }

    this.lastBalance = resultado.amount;
    const { amount, currency } = resultado;

    if (amount <= 0) {
      await this.#transition(ESTADOS.agotado, {
        asunto: 'WhatsApp caído: YCloud sin saldo',
        titulo: `La cuenta de YCloud está en ${amount} ${currency}`,
        cuerpo: [
          `El saldo de YCloud es ${amount} ${currency}: cualquier mensaje que el bot`,
          'intente mandar va a ser rechazado, y el contacto se queda sin respuesta.',
          '',
          'Recargar en dashboard.ycloud.com > Settings > Billing > Recharge.',
          'Es en YCloud, NO en Meta.'
        ].join('\n')
      });
    } else if (amount < this.lowBalanceUsd) {
      await this.#transition(ESTADOS.bajo, {
        asunto: `WhatsApp: a YCloud le quedan ${amount} ${currency}`,
        titulo: `Saldo bajo en YCloud: ${amount} ${currency}`,
        cuerpo: [
          `Quedan ${amount} ${currency} en la cuenta de YCloud, por debajo del umbral`,
          `de ${this.lowBalanceUsd} USD.`,
          '',
          'Al ritmo actual de mensajes esto es cuestión de días. Cuando llegue a 0,',
          'el bot deja de responderle a TODOS los contactos de golpe.',
          '',
          'Recargar en dashboard.ycloud.com > Settings > Billing > Recharge',
          '(y dejar activado el auto-recharge, que es un ajuste aparte del de la',
          'renovación de la suscripción).'
        ].join('\n')
      });
    } else {
      this.noteSuccess();
    }

    return { estado: this.estado, balance: amount, currency };
  }

  /**
   * Cambia de estado y decide si este aviso sale o se calla.
   *
   * Sale cuando el estado EMPEORA —de "poco saldo" a "sin saldo" hay que
   * enterarse en el acto— o cuando ya pasó la ventana de repetición. Repetir
   * el mismo aviso en cada vuelta del barrido lo convierte en ruido que se
   * filtra, y un aviso filtrado no avisa.
   */
  async #transition(estado, mensaje) {
    const empeora = GRAVEDAD[estado] > GRAVEDAD[this.estado];
    const vencido = this.lastAlertAt === null || this.now() - this.lastAlertAt >= this.realertMs;
    this.estado = estado;

    if (!empeora && !vencido) return { avisado: false, estado };

    this.lastAlertAt = this.now();
    if (!this.notify) {
      console.warn(`⚠️ [YCloud] ${mensaje.titulo} (sin notificador configurado: no se mandó correo).`);
      return { avisado: false, estado };
    }

    try {
      await this.notify(mensaje);
      console.warn(`📧 [YCloud] Aviso de saldo enviado: ${mensaje.titulo}`);
      return { avisado: true, estado };
    } catch (error) {
      // Nunca reintenta: si el correo falla se registra y se sigue. Lo que no
      // puede pasar es que el aviso de que WhatsApp está caído tumbe el
      // proceso que todavía atiende todo lo demás.
      console.error('❌ [YCloud] No se pudo mandar el aviso de saldo:', error.message);
      return { avisado: false, estado };
    }
  }
}

/**
 * Lee el saldo de la cuenta. Es de SOLO LECTURA y no gasta nada.
 *
 * Devuelve un resultado en vez de lanzar: a quien lo llama le importa
 * distinguir "no hay saldo" de "no se pudo preguntar", y una excepción vuelve
 * esas dos cosas la misma.
 */
export async function fetchYcloudBalance() {
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) return { ok: false, status: 0, reason: 'YCLOUD_API_KEY no está configurado.' };

  try {
    const response = await fetch(`${YCLOUD_API_ROOT}/balance`, {
      headers: { 'X-API-Key': apiKey }
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const reason = data?.message || data?.error?.message || `HTTP ${response.status}`;
      return { ok: false, status: response.status, reason, raw: data };
    }

    // El saldo viene siempre en USD, sea cual sea la moneda de facturación de
    // la WABA. El nombre del campo se lee con respaldo porque la respuesta
    // observada (`{"amount":0.05,"currency":"USD"}`) no es la única forma que
    // documentan.
    const amount = Number(data?.amount ?? data?.balance ?? NaN);
    if (!Number.isFinite(amount)) {
      return { ok: false, status: response.status, reason: `Respuesta sin saldo reconocible: ${JSON.stringify(data)}`, raw: data };
    }

    return { ok: true, status: response.status, amount, currency: data?.currency || 'USD', raw: data };
  } catch (error) {
    return { ok: false, status: 0, reason: error.message };
  }
}

/**
 * La instancia que comparten el envío, los barridos y el temporizador.
 *
 * Es un singleton de módulo y no una dependencia inyectada en cada servicio
 * porque el estado que guarda —"la cuenta está agotada"— es del PROCESO: si
 * cada llamador tuviera el suyo, el envío marcaría agotado un objeto que el
 * barrido nunca mira, y la pausa de reintentos no ocurriría.
 */
export const ycloudBalanceAlert = new YCloudBalanceAlert();
