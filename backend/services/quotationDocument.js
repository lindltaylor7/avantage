/**
 * Generador del documento de cotización con la identidad de marca de
 * Avantage Group (colores oliva/carbón, tipografía Montserrat y logotipo).
 *
 * El mismo HTML se usa para:
 *   - la vista imprimible que abre el botón "Generar Cotización" del Funnel
 *   - el cuerpo del correo que se envía al lead
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
    account: 'Cuenta Corriente (S/): 3557413863061',
    cci: 'CCI: 002 335 007413863061 66'
  },
  {
    bank: 'INTERBANK Perú',
    short: 'Interbank',
    account: 'Cuenta Corriente (S/): 8983515374983',
    cci: 'CCI: 00389801351537498347'
  }
];

/* Paleta de marca */
const C = {
  ink: '#23271d',
  green: '#8a9b30',
  greenDark: '#6f7d26',
  greenSoft: '#b9c96a',
  beige: '#eceadd',
  beigeLight: '#f5f4ec',
  panelDark: '#2f2f2b',
  red: '#b5322b',
  line: '#d8d6c6',
  textMuted: '#5c5f52'
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
    .map((line) => line.replace(/^[\s•*-]+/, '').trim())
    .filter(Boolean);
}

/* Logotipo AVANTAGE GROUP recreado en SVG (monograma "A" + arco "G"). */
function brandLogo({ dark = true } = {}) {
  const wordColor = dark ? '#ffffff' : C.ink;
  const groupColor = dark ? '#c9c9c1' : C.textMuted;
  return `
    <div class="ag-logo">
      <svg class="ag-logo__mark" viewBox="0 0 64 56" role="img" aria-label="Avantage Group">
        <path d="M32 3 L60 52 L44.5 52 L32 29 L26 40 L33 40 L37 47 L15 47 L32 3 Z" fill="${C.green}"/>
        <path d="M40 52 A21 21 0 1 1 44 20" fill="none" stroke="${C.greenSoft}" stroke-width="6" stroke-linecap="round"/>
      </svg>
      <div class="ag-logo__text">
        <span class="ag-logo__word" style="color:${wordColor}">A V A N T A G E</span>
        <span class="ag-logo__group">
          <span class="ag-logo__rule"></span>
          <span style="color:${groupColor}">G R O U P</span>
          <span class="ag-logo__rule"></span>
        </span>
        <span class="ag-logo__tagline">${esc(COMPANY.tagline)}</span>
      </div>
    </div>`;
}

function watermarkMark(className) {
  return `
    <svg class="${className}" viewBox="0 0 64 56" aria-hidden="true">
      <path d="M32 3 L60 52 L44.5 52 L32 29 L26 40 L33 40 L37 47 L15 47 L32 3 Z" fill="${C.green}"/>
      <path d="M40 52 A21 21 0 1 1 44 20" fill="none" stroke="${C.green}" stroke-width="6" stroke-linecap="round"/>
    </svg>`;
}

/**
 * Construye el documento HTML completo de la cotización.
 * @param {object} params
 * @param {object} params.quote  Fila de la tabla `quotes`.
 * @param {object} params.lead   Fila de la tabla `leads` asociada.
 * @param {boolean} [params.forPrint]  Muestra la barra con el botón "Imprimir / Guardar PDF".
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

  const scopeRow = scopeItems.length
    ? `<tr class="q-table__scope">
         <td></td>
         <td colspan="4">
           <ul>${scopeItems.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
         </td>
       </tr>`
    : '';

  const observations = quote.notes ? esc(quote.notes) : '';

  const printBar = forPrint
    ? `<div class="print-bar no-print">
         <button type="button" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --green:${C.green}; --green-dark:${C.greenDark}; --ink:${C.ink}; }
  body {
    font-family: 'Montserrat', 'Segoe UI', Tahoma, sans-serif;
    color: ${C.ink};
    background: #babab0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 820px;
    margin: 24px auto;
    background: ${C.beigeLight};
    box-shadow: 0 12px 40px rgba(0,0,0,0.25);
    overflow: hidden;
    position: relative;
  }

  /* ---------- Encabezado ---------- */
  .q-head { display: flex; align-items: stretch; }
  .q-head__brand {
    background: #1c1c1a;
    padding: 22px 26px 18px;
    flex: 0 0 45%;
    border-right: 10px solid ${C.green};
  }
  .q-head__meta {
    background: ${C.beige};
    flex: 1;
    padding: 20px 26px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .q-head__title { display: flex; flex-direction: column; align-items: flex-start; }
  .q-head__title h1 {
    font-size: 34px; font-weight: 800; letter-spacing: 1px; color: ${C.ink};
    line-height: 1;
  }
  .q-head__title .q-number {
    display: inline-block; margin-top: 8px; font-size: 13px; font-weight: 700;
    color: ${C.greenDark}; letter-spacing: 1.5px;
    border-bottom: 2px solid ${C.green}; padding-bottom: 3px;
  }
  .q-head__facts { font-size: 10.5px; line-height: 1.35; min-width: 190px; }
  .q-head__facts dt { font-weight: 700; letter-spacing: 0.5px; color: ${C.ink}; margin-top: 8px; }
  .q-head__facts dt:first-child { margin-top: 0; }
  .q-head__facts dd { color: ${C.textMuted}; }

  /* ---------- Logo ---------- */
  .ag-logo { display: flex; align-items: center; gap: 12px; }
  .ag-logo__mark { width: 58px; height: 52px; flex: none; }
  .ag-logo__text { display: flex; flex-direction: column; gap: 3px; }
  .ag-logo__word { font-size: 19px; font-weight: 700; letter-spacing: 1px; }
  .ag-logo__group { display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 600; letter-spacing: 2px; }
  .ag-logo__rule { height: 1px; width: 14px; background: ${C.red}; display: inline-block; }
  .ag-logo__tagline { font-size: 6.7px; font-weight: 600; letter-spacing: 0.7px; color: ${C.greenSoft}; margin-top: 2px; }

  /* ---------- Cuerpo ---------- */
  .q-body { padding: 26px; position: relative; z-index: 1; }
  .q-cols { display: flex; gap: 28px; margin-bottom: 26px; }
  .q-col { flex: 1; }
  .q-section-title {
    font-size: 15px; font-weight: 800; letter-spacing: 0.5px; color: ${C.greenDark};
    margin-bottom: 12px; text-transform: uppercase;
  }
  .q-client dl { font-size: 11px; line-height: 1.4; }
  .q-client dt { font-weight: 700; color: ${C.ink}; margin-top: 10px; }
  .q-client dt:first-child { margin-top: 0; }
  .q-client dd { color: ${C.textMuted}; }
  .q-presentation p { font-size: 11px; line-height: 1.7; color: ${C.ink}; margin-bottom: 8px; text-align: justify; }
  .q-presentation .sign { font-weight: 700; }
  .q-divider { width: 2px; background: ${C.green}; align-self: stretch; }

  /* ---------- Tabla ---------- */
  .q-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .q-table thead th {
    background: ${C.green}; color: #fff; font-weight: 700; letter-spacing: 0.5px;
    padding: 10px 12px; text-align: center; font-size: 11px;
  }
  .q-table thead th:nth-child(2) { text-align: left; }
  .q-table tbody td { padding: 14px 12px; border: 1px solid ${C.line}; vertical-align: top; }
  .q-table .q-num { text-align: center; font-weight: 800; font-size: 15px; color: ${C.ink}; width: 44px; }
  .q-table .q-desc { font-weight: 700; letter-spacing: 0.5px; }
  .q-table .q-center { text-align: center; }
  .q-table .q-right { text-align: right; white-space: nowrap; }
  .q-table__scope td { border-top: none; padding-top: 0; }
  .q-table__scope ul { list-style: none; }
  .q-table__scope li { position: relative; padding-left: 14px; margin-bottom: 5px; line-height: 1.45; color: ${C.ink}; }
  .q-table__scope li::before { content: "–"; position: absolute; left: 0; color: ${C.greenDark}; font-weight: 700; }

  /* ---------- Observaciones + total ---------- */
  .q-summary { display: flex; margin-top: 0; }
  .q-observations {
    flex: 1; border: 1px solid ${C.line}; border-top: none; padding: 14px 12px;
    font-size: 10.5px; color: ${C.textMuted}; line-height: 1.5;
  }
  .q-observations h4 { font-size: 12px; color: ${C.greenDark}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .q-total-label {
    background: ${C.panelDark}; color: #fff; font-weight: 700; font-size: 17px;
    display: flex; align-items: center; justify-content: center; padding: 0 26px;
  }
  .q-total-value {
    background: ${C.green}; color: #fff; font-weight: 800; font-size: 17px;
    display: flex; align-items: center; justify-content: center; padding: 0 26px; white-space: nowrap;
  }

  /* ---------- Franja de condiciones ---------- */
  .q-features { display: flex; gap: 16px; margin-top: 26px; text-align: center; }
  .q-feature { flex: 1; }
  .q-feature .q-feature__icon { font-size: 20px; }
  .q-feature h5 { font-size: 11px; font-weight: 800; color: ${C.greenDark}; margin: 6px 0 4px; letter-spacing: 0.5px; }
  .q-feature p { font-size: 9.5px; color: ${C.textMuted}; line-height: 1.4; }

  /* ---------- Pie ---------- */
  .q-foot {
    margin-top: 26px; background: #1c1c1a; color: #d7d7cf; padding: 24px 26px;
    display: flex; gap: 40px; position: relative; overflow: hidden;
  }
  .q-foot h6 { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; margin-bottom: 10px; }
  .q-foot__block { font-size: 9.5px; line-height: 1.7; position: relative; z-index: 1; }
  .q-foot__block strong { color: #fff; font-weight: 700; }
  .q-foot__pay { margin-bottom: 8px; }
  .q-foot .ag-foot-mark {
    position: absolute; right: -20px; bottom: -30px; width: 200px; height: 180px; opacity: 0.12;
  }

  /* ---------- Marca de agua ---------- */
  .ag-watermark { position: absolute; width: 360px; height: 320px; right: -40px; top: 150px; z-index: 0; opacity: 0.05; pointer-events: none; }

  /* ---------- Barra de impresión ---------- */
  .print-bar { text-align: center; padding: 16px; }
  .print-bar button {
    background: ${C.green}; color: #fff; border: none; padding: 12px 26px; font-size: 14px;
    font-weight: 700; border-radius: 8px; cursor: pointer; font-family: inherit;
  }
  .print-bar button:hover { background: ${C.greenDark}; }

  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .sheet { width: 100%; margin: 0; box-shadow: none; }
    @page { size: A4; margin: 12mm; }
  }
</style>
</head>
<body>
${printBar}
<div class="sheet">

  <header class="q-head">
    <div class="q-head__brand">${brandLogo({ dark: true })}</div>
    <div class="q-head__meta">
      <div class="q-head__title">
        <h1>COTIZACIÓN</h1>
        <span class="q-number">${esc(quoteNumber)}</span>
      </div>
      <dl class="q-head__facts">
        <dt>📅 FECHA:</dt><dd>${esc(issueDate)}</dd>
        <dt>🗓️ VÁLIDO HASTA:</dt><dd>${esc(validUntil)}</dd>
        <dt>📝 ELABORADO POR:</dt><dd>${esc(COMPANY.brandName)}</dd>
      </dl>
    </div>
  </header>

  ${watermarkMark('ag-watermark')}

  <div class="q-body">

    <div class="q-cols">
      <div class="q-col q-client">
        <div class="q-section-title">👤 Datos del Cliente</div>
        <dl>
          <dt>Cliente:</dt><dd>${esc(clientName)}</dd>
          <dt>Carrera:</dt><dd>${esc(career)}</dd>
          <dt>Correo:</dt><dd>${esc(lead.email || '—')}</dd>
          <dt>Teléfono:</dt><dd>${esc(lead.phone || '—')}</dd>
        </dl>
      </div>
      <div class="q-divider"></div>
      <div class="q-col q-presentation">
        <div class="q-section-title">Presentación</div>
        <p>Estimados señores,</p>
        <p>Agradecemos la oportunidad de presentar nuestra propuesta. En ${esc(COMPANY.brandName)} ofrecemos soluciones personalizadas que impulsan su crecimiento. Quedamos atentos a cualquier consulta.</p>
        <p>Atentamente,<br><span class="sign">${esc(COMPANY.brandName)}</span></p>
      </div>
    </div>

    <table class="q-table">
      <thead>
        <tr>
          <th>N°</th>
          <th>DESCRIPCIÓN</th>
          <th>CANT.</th>
          <th>PRECIO UNIT.</th>
          <th>SUBTOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="q-num">01</td>
          <td class="q-desc">${esc(conceptTitle)}</td>
          <td class="q-center">${quantity}</td>
          <td class="q-right">${formatMoney(unitPrice, currency)}</td>
          <td class="q-right">${formatMoney(total, currency)}</td>
        </tr>
        ${scopeRow}
      </tbody>
    </table>

    <div class="q-summary">
      <div class="q-observations">
        <h4>Observaciones</h4>
        ${observations || '<span>&nbsp;</span>'}
      </div>
      <div class="q-total-label">TOTAL</div>
      <div class="q-total-value">${formatMoney(total, currency)}</div>
    </div>

    <div class="q-features">
      <div class="q-feature">
        <div class="q-feature__icon">⏱️</div>
        <h5>TIEMPO DE ENTREGA</h5>
        <p>Según cronograma acordado y explicado</p>
      </div>
      <div class="q-feature">
        <div class="q-feature__icon">💳</div>
        <h5>FORMA DE PAGO</h5>
        <p>Medios de pago según convenga al cliente</p>
      </div>
      <div class="q-feature">
        <div class="q-feature__icon">🛡️</div>
        <h5>GARANTÍA</h5>
        <p>Garantizamos todo mediante un contrato</p>
      </div>
      <div class="q-feature">
        <div class="q-feature__icon">📆</div>
        <h5>VALIDEZ DE LA OFERTA</h5>
        <p>La presente cotización tiene validez hasta la fecha indicada</p>
      </div>
    </div>
  </div>

  <footer class="q-foot">
    <div class="q-foot__block">
      <h6>DATOS DE LA EMPRESA</h6>
      <div>🏢 <strong>${esc(COMPANY.legalName)}</strong></div>
      <div>🆔 RUC: ${esc(COMPANY.ruc)}</div>
      <div>📍 ${esc(COMPANY.address)}<br>&nbsp;&nbsp;&nbsp;${esc(COMPANY.addressCity)}</div>
      <div>📞 ${esc(COMPANY.phone)}</div>
      <div>✉️ ${esc(COMPANY.email)}</div>
      <div>🌐 ${esc(COMPANY.website)}</div>
    </div>
    <div class="q-foot__block">
      <h6>MÉTODOS DE PAGO</h6>
      ${PAYMENT_METHODS.map((m) => `
        <div class="q-foot__pay">
          <strong>${esc(m.bank)}</strong><br>
          ${esc(m.account)}<br>
          ${esc(m.cci)}
        </div>`).join('')}
    </div>
    ${watermarkMark('ag-foot-mark')}
  </footer>

</div>
</body>
</html>`;
}
