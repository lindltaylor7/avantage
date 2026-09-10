/**
 * Generador del documento de cotización con la identidad de marca de
 * Avantage Group (oliva/carbón, tipografía geométrica y monograma "AG").
 *
 * El mismo HTML se usa para:
 *   - la vista imprimible que abre el botón "Generar Cotización" del Funnel
 *   - el cuerpo del correo que se envía al lead
 *
 * El lienzo mide 194 mm (A4 menos 8 mm de margen por lado). Ese margen
 * evita que las bandas oscuras se recorten en impresoras de inyección, que
 * casi nunca imprimen a sangre completa.
 */

/* Datos fijos de la empresa (tomados de la plantilla oficial de cotización). */
export const COMPANY = {
  legalName: 'Avantage Group S.A.C.',
  brandName: 'Avantage Group',
  ruc: '20615846971',
  address: 'Calle Neptuno 185',
  addressCity: 'Huancayo, Huancayo - Perú',
  phone: '+51 972566937',
  email: 'avantage@avantagegroup.com',
  website: 'www.grupoavantage.com',
  tagline: 'INNOVACIÓN · INVESTIGACIÓN · SOFTWARE · MARKETING'
};

export const PAYMENT_METHODS = [
  {
    bank: 'Banco de Crédito del Perú',
    short: 'BCP',
    accent: '#c0392b',
    account: 'Cuenta Corriente (S/): 3557413863061',
    cci: 'CCI: 002 335 007413863061 66'
  },
  {
    bank: 'INTERBANK Perú',
    short: 'Interbank',
    accent: '#0aa05a',
    account: 'Cuenta Corriente (S/): 8983515374983',
    cci: 'CCI: 00389801351537498347'
  }
];

/* Paleta de marca */
const C = {
  ink: '#1f1f1c',
  inkFoot: '#1b1b18',
  olive: '#8a9b30',
  oliveDeep: '#68761f',
  olivePale: '#cbd69a',
  sand: '#ece9dc',
  paper: '#f7f6ef',
  rule: '#dcdac9',
  muted: '#5d5e51',
  brick: '#b23a2c'
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatQuoteNumber(quote) {
  const year = new Date(quote.created_at || Date.now()).getFullYear();
  return `CTZ-${year}-${String(quote.id).padStart(4, '0')}`;
}

function formatLongDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMoney(amount, currency) {
  const symbol = currency === 'USD' ? 'US$' : 'S/';
  const number = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol} ${number}`;
}

function parseScopeItems(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*+\-–]+/, '').trim())
    .filter(Boolean);
}

/* ── Iconografía de línea (16×16, trazo `currentColor`) ─────────────────── */
const ICONS = {
  user: '<circle cx="8" cy="5.4" r="3"/><path d="M2.6 14c0-3 2.4-5 5.4-5s5.4 2 5.4 5"/>',
  career: '<rect x="2" y="5" width="12" height="8" rx="1.2"/><path d="M6 5V3.6h4V5"/><path d="M2 8.6h12"/>',
  mail: '<rect x="2" y="3.6" width="12" height="8.8" rx="1.2"/><path d="m2.6 4.6 5.4 4 5.4-4"/>',
  phone: '<path d="M4.2 2.5 6 5.6 4.6 7.2c.9 1.8 2.4 3.3 4.2 4.2l1.6-1.4 3.1 1.8c-.1 1.4-1.1 2.4-2.6 2.4C6.5 14.2 1.8 9.5 1.8 3.7 1.8 2.2 2.8 1.2 4.2 1.1c.4 0 .8.4 1 1z"/>',
  calendar: '<rect x="2" y="3" width="12" height="11" rx="1.2"/><path d="M2 6.4h12M5.4 1.8v2.6M10.6 1.8v2.6"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.6 1.6"/>',
  card: '<rect x="1.5" y="4" width="13" height="8" rx="1.2"/><path d="M1.5 6.9h13"/>',
  shield: '<path d="M8 1.5 13 3.4V8c0 3.5-2.5 5.6-5 6.6C5.5 13.6 3 11.5 3 8V3.4z"/><path d="m5.9 8 1.5 1.6L10.3 6"/>',
  doc: '<path d="M4 1.6h5l3 3v9.8H4z"/><path d="M9 1.6v3h3"/><path d="M6 8h4M6 10.4h4"/>'
};

function icon(name, cls = 'q-ic') {
  return `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ── Monograma "AG": "A" facetada en dos planos + curva "G" entrelazada ── */
function agMarkPaths({ mono = false } = {}) {
  const planeA = C.olive;
  const planeB = mono ? C.olive : C.oliveDeep;
  const arc = mono ? C.olive : C.oliveDeep;
  return `
    <path d="M24 5 L42 52 L32 52 L24 29 Z" fill="${planeB}"/>
    <path d="M24 5 L6 52 L16 52 L24 29 Z" fill="${planeA}"/>
    <path d="M15 39 L33 39 L30 32 L18 32 Z" fill="${planeA}"/>
    <circle cx="52" cy="30" r="12" fill="none" stroke="${arc}" stroke-width="5"
      stroke-linecap="round" stroke-dasharray="57 18" stroke-dashoffset="9"/>
    <path d="M53 30 L61 30" fill="none" stroke="${arc}" stroke-width="5" stroke-linecap="round"/>`;
}

function brandLogo({ dark = true } = {}) {
  const wordColor = dark ? '#ffffff' : C.ink;
  const groupColor = dark ? '#cfcfc6' : C.muted;
  return `
    <div class="q-logo">
      <svg class="q-logo__mark" viewBox="0 0 70 58" role="img" aria-label="Avantage Group">${agMarkPaths()}</svg>
      <span class="q-logo__text">
        <span class="q-logo__word" style="color:${wordColor}">AVANTAGE</span>
        <span class="q-logo__group">
          <i class="q-logo__rule"></i><span style="color:${groupColor}">GROUP</span><i class="q-logo__rule"></i>
        </span>
        <span class="q-logo__tag">${esc(COMPANY.tagline)}</span>
      </span>
    </div>`;
}

function monogram(cls) {
  return `<svg class="${cls}" viewBox="0 0 70 58" aria-hidden="true">${agMarkPaths({ mono: true })}</svg>`;
}

/**
 * Construye el documento HTML completo de la cotización.
 * @param {object} params
 * @param {object} params.quote  Fila de la tabla `quotes`.
 * @param {object} params.lead   Fila de la tabla `leads` asociada.
 * @param {boolean} [params.forPrint]  Muestra la barra con el botón "Imprimir".
 */
export function buildQuotationDocument({ quote, lead, forPrint = false }) {
  const currency = quote.currency || 'PEN';
  const quantity = Number(quote.quantity || 1);
  const total = Number(quote.amount || 0);
  const unitPrice = quantity > 0 ? total / quantity : total;

  const scopeItems = parseScopeItems(quote.scope_items);
  const quoteNumber = formatQuoteNumber(quote);
  const issueDate = formatLongDate(quote.created_at || new Date());
  const validUntil = formatLongDate(quote.valid_until);

  const clientName = lead.full_name || lead.email || 'Cliente';
  const career = lead.field_of_study || lead.university || '—';
  const conceptTitle = quote.concept_title || 'TESIS COMPLETA';
  const observations = quote.notes ? esc(quote.notes) : '';

  const scopeRow = scopeItems.length
    ? `<tr class="q-scope">
         <td></td>
         <td colspan="4"><ul>${scopeItems.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></td>
       </tr>`
    : '';

  const printBar = forPrint
    ? `<div class="q-printbar q-noprint">
         <button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button>
         <span>Sugerencia: en el diálogo elige “Márgenes: Predeterminados” y desactiva “Encabezados y pies de página”.</span>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotización ${esc(quoteNumber)} — ${esc(COMPANY.brandName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: ${C.ink};
    --olive: ${C.olive};
    --olive-deep: ${C.oliveDeep};
    --sand: ${C.sand};
    --paper: ${C.paper};
    --rule: ${C.rule};
    --muted: ${C.muted};
  }

  body {
    font-family: 'Montserrat', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: var(--ink);
    background: #b7b6ac;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .q-sheet {
    width: 194mm;
    min-height: 274mm;
    margin: 20px auto;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 14px 44px rgba(0,0,0,0.28);
    position: relative;
  }

  /* ─── Encabezado con costura diagonal ─── */
  .q-head { position: relative; display: grid; grid-template-columns: 52% 1fr; background: var(--sand); overflow: hidden; }
  .q-head__brand {
    background: var(--ink);
    padding: 24px 30px 20px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%);
    position: relative;
    z-index: 1;
  }
  .q-head__seam {
    position: absolute;
    top: -10px; bottom: -10px;
    left: 52%;
    width: 30px;
    margin-left: -25px;
    background: var(--olive);
    transform: skewX(-13deg);
    z-index: 2;
  }
  .q-head__meta {
    padding: 22px 26px 20px 38px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    position: relative;
    z-index: 1;
  }

  .q-title { display: flex; flex-direction: column; align-items: flex-start; }
  .q-title h1 { font-size: 30px; font-weight: 800; letter-spacing: 1.5px; color: var(--ink); line-height: 0.95; }
  .q-title .q-num {
    margin-top: 9px; font-size: 11px; font-weight: 700; letter-spacing: 2px;
    color: var(--olive-deep); padding-bottom: 4px; border-bottom: 2px solid var(--olive);
  }
  .q-facts { display: grid; gap: 10px; }
  .q-fact__k {
    display: flex; align-items: center; gap: 6px;
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.7px; color: var(--ink);
  }
  .q-fact__v { font-size: 9px; color: var(--muted); margin-top: 2px; padding-left: 18px; line-height: 1.3; }
  .q-fact .q-ic { width: 12px; height: 12px; color: var(--olive-deep); flex: none; }

  /* ─── Logo ─── */
  .q-logo { display: flex; align-items: center; gap: 13px; }
  .q-logo__mark { width: 50px; height: 47px; flex: none; }
  .q-logo__text { display: flex; flex-direction: column; gap: 4px; }
  .q-logo__word { font-size: 21px; font-weight: 700; letter-spacing: 5.5px; line-height: 1; }
  .q-logo__group { display: flex; align-items: center; gap: 7px; font-size: 8px; font-weight: 600; letter-spacing: 3.5px; padding-left: 3px; }
  .q-logo__rule { width: 15px; height: 1px; background: ${C.brick}; display: inline-block; }
  .q-logo__tag { font-size: 5.7px; font-weight: 600; letter-spacing: 0.7px; color: ${C.olivePale}; white-space: nowrap; margin-top: 2px; }

  /* ─── Cuerpo ─── */
  .q-body { flex: 1; padding: 26px 30px 22px; position: relative; }
  .q-watermark {
    position: absolute; right: -14px; top: 40px; width: 230px; height: 214px;
    opacity: 0.06; z-index: 0; pointer-events: none;
  }
  .q-body > *:not(.q-watermark) { position: relative; z-index: 1; }

  .q-intro { display: grid; grid-template-columns: 1fr 2px 1.15fr; gap: 26px; margin-bottom: 26px; }
  .q-rule-v { background: var(--olive); }
  .q-h {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 800; letter-spacing: 0.6px; color: var(--olive-deep);
    text-transform: uppercase; margin-bottom: 13px;
  }
  .q-h .q-ic { width: 16px; height: 16px; }

  .q-client dl { display: grid; gap: 11px; }
  .q-client .q-field { display: flex; gap: 9px; }
  .q-client .q-ic { width: 15px; height: 15px; color: var(--olive-deep); flex: none; margin-top: 1px; }
  .q-client dt { font-size: 9px; font-weight: 700; letter-spacing: 0.4px; color: var(--ink); }
  .q-client dd { font-size: 10px; color: var(--muted); margin-top: 2px; line-height: 1.35; }

  .q-present p { font-size: 10px; line-height: 1.75; color: var(--ink); margin-bottom: 9px; text-align: justify; }
  .q-present .q-sign { font-weight: 700; }

  /* ─── Tabla de ítems ─── */
  .q-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .q-table thead th {
    background: var(--olive); color: #fff; font-weight: 700; letter-spacing: 0.5px;
    padding: 9px 12px; text-align: center; font-size: 9.5px; text-transform: uppercase;
  }
  .q-table thead th.q-desc-h { text-align: left; }
  .q-table tbody td { padding: 13px 12px; border: 1px solid var(--rule); vertical-align: top; }
  .q-table .q-n { text-align: center; font-weight: 800; font-size: 14px; width: 40px; }
  .q-table .q-concept { display: flex; align-items: center; gap: 9px; font-weight: 800; letter-spacing: 0.5px; }
  .q-table .q-concept .q-ic { width: 17px; height: 17px; color: var(--olive-deep); flex: none; }
  .q-table .q-c { text-align: center; }
  .q-table .q-r { text-align: right; white-space: nowrap; }
  .q-scope td { border-top: none; padding-top: 2px; padding-bottom: 16px; }
  .q-scope ul { list-style: none; display: grid; gap: 6px; }
  .q-scope li { position: relative; padding-left: 15px; line-height: 1.4; color: var(--ink); }
  .q-scope li::before { content: "–"; position: absolute; left: 2px; color: var(--olive-deep); font-weight: 700; }

  /* ─── Observaciones + total ─── */
  .q-summary { display: grid; grid-template-columns: 1fr auto auto; }
  .q-obs {
    border: 1px solid var(--rule); border-top: none; padding: 13px 14px;
    font-size: 9.5px; color: var(--muted); line-height: 1.55;
  }
  .q-obs h4 { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; color: var(--olive-deep); text-transform: uppercase; margin-bottom: 5px; }
  .q-total-k {
    background: var(--ink); color: #fff; font-weight: 700; font-size: 15px; letter-spacing: 1px;
    display: flex; align-items: center; justify-content: center; padding: 0 30px;
  }
  .q-total-v {
    background: var(--olive); color: #fff; font-weight: 800; font-size: 16px;
    display: flex; align-items: center; justify-content: center; padding: 0 26px; white-space: nowrap;
  }

  /* ─── Condiciones ─── */
  .q-terms { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 26px; text-align: center; }
  .q-term .q-ic { width: 22px; height: 22px; color: var(--olive-deep); }
  .q-term h5 { font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; color: var(--olive-deep); margin: 6px 0 4px; text-transform: uppercase; }
  .q-term p { font-size: 8.5px; color: var(--muted); line-height: 1.45; }

  /* ─── Pie ─── */
  .q-foot {
    margin-top: auto; background: ${C.inkFoot}; color: #d6d6ce;
    padding: 24px 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 34px;
    position: relative; overflow: hidden;
  }
  .q-foot::before {
    content: ""; position: absolute; right: -30px; top: -20px; bottom: -20px; width: 90px;
    background: var(--olive); opacity: 0.16; transform: skewX(-13deg);
  }
  .q-foot h6 { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #fff; margin-bottom: 11px; text-transform: uppercase; }
  .q-foot__list { display: grid; gap: 5px; font-size: 8.7px; line-height: 1.55; position: relative; z-index: 1; }
  .q-foot__list .q-row { display: flex; gap: 7px; align-items: flex-start; }
  .q-foot__list .q-ic { width: 12px; height: 12px; color: ${C.olivePale}; flex: none; margin-top: 1px; }
  .q-foot__list strong { color: #fff; font-weight: 700; }
  .q-pay { margin-bottom: 9px; position: relative; z-index: 1; }
  .q-pay:last-child { margin-bottom: 0; }
  .q-pay__bank { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .q-pay__chip { font-size: 7.5px; font-weight: 800; letter-spacing: 0.5px; color: #fff; padding: 2px 6px; border-radius: 3px; }
  .q-pay__bank span { font-size: 9px; font-weight: 700; color: #fff; }
  .q-pay__line { font-size: 8.5px; color: #cfcfc6; line-height: 1.5; }
  .q-foot-mark { position: absolute; right: 10px; bottom: -14px; width: 132px; height: 124px; opacity: 0.1; z-index: 0; }

  /* ─── Barra de impresión (solo pantalla) ─── */
  .q-printbar { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px 4px; text-align: center; }
  .q-printbar button {
    background: var(--olive); color: #fff; border: none; padding: 11px 26px; font-size: 13px;
    font-weight: 700; border-radius: 8px; cursor: pointer; font-family: inherit; letter-spacing: 0.3px;
  }
  .q-printbar button:hover { background: var(--olive-deep); }
  .q-printbar span { font-size: 11px; color: #4b4b44; }

  @media print {
    html, body { background: #fff; width: 210mm; }
    .q-noprint { display: none !important; }
    .q-sheet {
      width: 210mm;
      min-height: 296mm;
      margin: 0;
      box-shadow: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .q-intro, .q-table, .q-summary, .q-terms, .q-foot { break-inside: avoid; }
    @page { size: A4; margin: 0; }
  }

  @media screen and (max-width: 840px) {
    .q-sheet { width: 100%; min-height: 0; }
  }
</style>
</head>
<body>
${printBar}
<div class="q-sheet">

  <header class="q-head">
    <div class="q-head__brand">${brandLogo({ dark: true })}</div>
    <div class="q-head__seam"></div>
    <div class="q-head__meta">
      <div class="q-title">
        <h1>COTIZACIÓN</h1>
        <span class="q-num">${esc(quoteNumber)}</span>
      </div>
      <div class="q-facts">
        <div class="q-fact"><div class="q-fact__k">${icon('calendar')} FECHA</div><div class="q-fact__v">${esc(issueDate)}</div></div>
        <div class="q-fact"><div class="q-fact__k">${icon('calendar')} VÁLIDO HASTA</div><div class="q-fact__v">${esc(validUntil)}</div></div>
        <div class="q-fact"><div class="q-fact__k">${icon('doc')} ELABORADO POR</div><div class="q-fact__v">${esc(COMPANY.brandName)}</div></div>
      </div>
    </div>
  </header>

  <div class="q-body">
    ${monogram('q-watermark')}

    <div class="q-intro">
      <div class="q-client">
        <div class="q-h">${icon('user')} Datos del cliente</div>
        <dl>
          <div class="q-field">${icon('user')}<div><dt>Cliente</dt><dd>${esc(clientName)}</dd></div></div>
          <div class="q-field">${icon('career')}<div><dt>Carrera</dt><dd>${esc(career)}</dd></div></div>
          <div class="q-field">${icon('mail')}<div><dt>Correo</dt><dd>${esc(lead.email || '—')}</dd></div></div>
          <div class="q-field">${icon('phone')}<div><dt>Teléfono</dt><dd>${esc(lead.phone || '—')}</dd></div></div>
        </dl>
      </div>
      <div class="q-rule-v"></div>
      <div class="q-present">
        <div class="q-h">Presentación</div>
        <p>Estimados señores,</p>
        <p>Agradecemos la oportunidad de presentar nuestra propuesta. En ${esc(COMPANY.brandName)} ofrecemos soluciones personalizadas que impulsan su crecimiento. Quedamos atentos a cualquier consulta.</p>
        <p>Atentamente,<br><span class="q-sign">${esc(COMPANY.brandName)}</span></p>
      </div>
    </div>

    <table class="q-table">
      <thead>
        <tr>
          <th>N°</th>
          <th class="q-desc-h">Descripción</th>
          <th>Cant.</th>
          <th>Precio unit.</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="q-n">01</td>
          <td><span class="q-concept">${icon('doc')} ${esc(conceptTitle)}</span></td>
          <td class="q-c">${quantity}</td>
          <td class="q-r">${formatMoney(unitPrice, currency)}</td>
          <td class="q-r">${formatMoney(total, currency)}</td>
        </tr>
        ${scopeRow}
      </tbody>
    </table>

    <div class="q-summary">
      <div class="q-obs">
        <h4>Observaciones</h4>
        ${observations || '&nbsp;'}
      </div>
      <div class="q-total-k">TOTAL</div>
      <div class="q-total-v">${formatMoney(total, currency)}</div>
    </div>

    <div class="q-terms">
      <div class="q-term">${icon('clock')}<h5>Tiempo de entrega</h5><p>Según cronograma acordado y explicado</p></div>
      <div class="q-term">${icon('card')}<h5>Forma de pago</h5><p>Medios de pago según convenga al cliente</p></div>
      <div class="q-term">${icon('shield')}<h5>Garantía</h5><p>Garantizamos todo mediante un contrato</p></div>
      <div class="q-term">${icon('calendar')}<h5>Validez de la oferta</h5><p>La cotización tiene validez hasta la fecha indicada</p></div>
    </div>
  </div>

  <footer class="q-foot">
    <div>
      <h6>Datos de la empresa</h6>
      <div class="q-foot__list">
        <div class="q-row">${icon('career')}<span><strong>${esc(COMPANY.legalName)}</strong></span></div>
        <div class="q-row">${icon('doc')}<span>RUC: ${esc(COMPANY.ruc)}</span></div>
        <div class="q-row">${icon('user')}<span>${esc(COMPANY.address)}, ${esc(COMPANY.addressCity)}</span></div>
        <div class="q-row">${icon('phone')}<span>${esc(COMPANY.phone)}</span></div>
        <div class="q-row">${icon('mail')}<span>${esc(COMPANY.email)}</span></div>
        <div class="q-row">${icon('career')}<span>${esc(COMPANY.website)}</span></div>
      </div>
    </div>
    <div>
      <h6>Métodos de pago</h6>
      ${PAYMENT_METHODS.map((m) => `
        <div class="q-pay">
          <span class="q-pay__bank">
            <span class="q-pay__chip" style="background:${m.accent}">${esc(m.short)}</span>
            <span>${esc(m.bank)}</span>
          </span>
          <div class="q-pay__line">${esc(m.account)}<br>${esc(m.cci)}</div>
        </div>`).join('')}
    </div>
    ${monogram('q-foot-mark')}
  </footer>

</div>
</body>
</html>`;
}
