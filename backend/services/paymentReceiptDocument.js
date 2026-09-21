/**
 * Generador del COMPROBANTE DE PAGO que Finanzas emite cuando un ingreso
 * queda verificado.
 *
 * Es el tercer documento de la familia (cotización → contrato → comprobante)
 * y reutiliza las piezas de marca de `quotationDocument.js` —paleta, logo,
 * iconos y formateo de montos— en vez de copiarlas: si el logo o el olivo
 * cambian, los tres documentos tienen que cambiar juntos.
 *
 * El mismo HTML sirve para la vista imprimible y para el cuerpo del correo
 * que se le manda al cliente, igual que la cotización. Por eso `forEmail`
 * apunta el símbolo al adjunto `cid:` en vez del data URI, que los clientes
 * de correo bloquean.
 */
import {
  BRAND_COLORS as C,
  BRAND_MARK,
  BRAND_MARK_CID,
  COMPANY,
  brandLogo,
  esc,
  formatLongDate,
  formatMoney,
  icon,
  monogram
} from './quotationDocument.js';

/**
 * Número del comprobante: CP-<año>-<id a 4 dígitos>. Se deriva del id del
 * ingreso —no de un contador aparte— para que el papel y la fila de Finanzas
 * se puedan cruzar sin ambigüedad.
 */
export function formatReceiptNumber(income) {
  const year = new Date(income.fecha || income.created_at || Date.now()).getFullYear();
  return `CP-${year}-${String(income.id).padStart(4, '0')}`;
}

/**
 * "1era" → "PRIMER PAGO". El concepto que ve el cliente no puede ser la
 * abreviatura interna del libro de Finanzas.
 */
const CUOTA_LABELS = {
  '1era': 'PRIMER PAGO',
  '2da': 'SEGUNDO PAGO',
  '3era': 'TERCER PAGO'
};

export function receiptConcept(income) {
  return CUOTA_LABELS[income.cuota] || (income.cuota ? `PAGO ${String(income.cuota).toUpperCase()}` : 'PAGO');
}

/**
 * @param {object} params
 * @param {object} params.income  Fila de `finance_income` con los datos del
 *   lead ya unidos (lead_name, lead_email, lead_phone, lead_career).
 * @param {boolean} [params.forPrint]  Muestra la barra con el botón "Imprimir".
 * @param {boolean} [params.forEmail]  Apunta el símbolo al adjunto `cid:`.
 */
export function buildPaymentReceiptDocument({ income, forPrint = false, forEmail = false }) {
  const markSrc = forEmail ? `cid:${BRAND_MARK_CID}` : BRAND_MARK;
  const number = formatReceiptNumber(income);
  const concept = receiptConcept(income);
  const amount = Number(income.monto || 0);
  // El libro de Finanzas no registra descuentos por cobro: la línea va en
  // cero y no se inventa un dato que nadie capturó.
  const discount = 0;
  const currency = 'PEN';

  const clientName = income.lead_name || 'Cliente';
  const career = income.lead_career || '—';

  const printBar = forPrint ? `
    <div class="r-printbar r-noprint">
      <button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button>
      <span>En el diálogo elige “Guardar como PDF”, tamaño A4 y desactiva “Encabezados y pies de página”.</span>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(number)} — Comprobante de pago</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: ${C.ink};
    --olive: ${C.olive};
    --olive-deep: ${C.oliveDeep};
    --olive-pale: ${C.olivePale};
    --sand: ${C.sand};
    --paper: ${C.paper};
    --rule: ${C.rule};
    --muted: ${C.muted};
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #d9d8cf;
    color: var(--ink);
    font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.45;
  }

  .r-sheet {
    width: 194mm;
    min-height: 150mm;
    margin: 20px auto;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 14px 44px rgba(0,0,0,0.28);
    position: relative;
  }

  /* ─── Encabezado con costura diagonal (igual que la cotización) ─── */
  .r-head { position: relative; display: grid; grid-template-columns: 52% 1fr; background: var(--sand); overflow: hidden; }
  .r-head__brand {
    background: var(--ink);
    padding: 24px 30px 20px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%);
    position: relative;
    z-index: 1;
  }
  .r-head__seam {
    position: absolute;
    top: -10px; bottom: -10px;
    left: 52%;
    width: 30px;
    margin-left: -25px;
    background: var(--olive);
    transform: skewX(-13deg);
    z-index: 2;
  }
  .r-head__meta {
    padding: 22px 26px 20px 38px;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 20px;
    position: relative;
    z-index: 1;
  }

  .r-title { display: flex; flex-direction: column; align-items: flex-start; }
  .r-title h1 { font-size: 23px; font-weight: 800; letter-spacing: 1.2px; color: var(--olive-deep); line-height: 1; }
  .r-title .r-num {
    margin-top: 9px; font-size: 11px; font-weight: 700; letter-spacing: 2px;
    color: var(--ink); padding-bottom: 4px; border-bottom: 2px solid var(--olive);
  }
  .r-facts { display: grid; gap: 10px; }
  .r-fact__k {
    display: flex; align-items: center; gap: 6px;
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.7px; color: var(--ink);
  }
  .r-fact__v { font-size: 9px; color: var(--muted); margin-top: 2px; padding-left: 18px; line-height: 1.3; }
  .r-fact .q-ic { width: 12px; height: 12px; color: var(--olive-deep); flex: none; }

  /* ─── Logo (mismas clases que la cotización: viene de brandLogo()) ─── */
  .q-logo { display: flex; align-items: center; gap: 13px; }
  .q-logo__mark { height: 44px; width: auto; flex: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .q-logo__text { display: flex; flex-direction: column; gap: 4px; }
  .q-logo__word { font-size: 21px; font-weight: 700; letter-spacing: 5.5px; line-height: 1; }
  .q-logo__group { display: flex; align-items: center; gap: 7px; font-size: 8px; font-weight: 600; letter-spacing: 3.5px; padding-left: 3px; }
  .q-logo__rule { width: 15px; height: 1px; background: ${C.brick}; display: inline-block; }
  .q-logo__tag { font-size: 5.7px; font-weight: 600; letter-spacing: 0.7px; color: var(--olive-pale); white-space: nowrap; margin-top: 2px; }

  /* ─── Cuerpo ─── */
  .r-body { flex: 1; padding: 26px 30px 22px; position: relative; }
  .r-watermark {
    position: absolute; right: -14px; top: 30px; width: 230px; height: auto;
    opacity: 0.06; z-index: 0; pointer-events: none;
  }
  .r-body > *:not(.r-watermark) { position: relative; z-index: 1; }

  .r-intro { display: grid; grid-template-columns: 1fr 2px 1.1fr 0.75fr; gap: 22px; margin-bottom: 24px; }
  .r-rule-v { background: var(--olive); }
  .r-h {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 800; letter-spacing: 0.6px; color: var(--olive-deep);
    text-transform: uppercase; margin-bottom: 10px;
  }
  .r-h .q-ic { width: 15px; height: 15px; color: var(--olive-deep); }

  .r-client dl { display: grid; gap: 7px; }
  .r-field { display: flex; align-items: flex-start; gap: 7px; }
  .r-field .q-ic { width: 13px; height: 13px; color: var(--olive-deep); flex: none; margin-top: 1px; }
  .r-field dt { display: inline; font-size: 9.5px; font-weight: 700; color: var(--ink); }
  .r-field dd { display: inline; font-size: 9.5px; color: var(--muted); margin-left: 3px; }

  .r-present p { font-size: 9.5px; color: var(--muted); margin-bottom: 7px; }
  .r-present .r-sign { font-weight: 700; color: var(--ink); }

  .r-concept__k { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; color: var(--olive-deep); text-transform: uppercase; }
  .r-concept__v { font-size: 10px; color: var(--muted); margin-top: 5px; }

  /* ─── Detalle del pago ─── */
  .r-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .r-table thead th {
    background: var(--olive); color: #fff; font-size: 10px; font-weight: 800;
    letter-spacing: 0.7px; text-transform: uppercase; padding: 12px 16px; text-align: left;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .r-table thead th:last-child { text-align: right; }
  .r-table tbody td {
    padding: 13px 16px; font-size: 10.5px; border-bottom: 1px solid var(--rule); background: #fff;
  }
  .r-table tbody td:last-child { text-align: right; font-weight: 700; }
  .r-table .r-concept-cell { font-weight: 800; letter-spacing: 0.4px; }
  .r-table .r-sub-k { text-align: right; font-weight: 700; color: var(--ink); }

  .r-total {
    display: grid; grid-template-columns: 1fr auto auto; align-items: stretch;
    background: #cdd2b4; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .r-total__spacer { }
  .r-total__k {
    display: flex; align-items: center; padding: 14px 18px;
    font-size: 13px; font-weight: 800; letter-spacing: 0.8px; color: var(--olive-deep);
  }
  .r-total__v {
    display: flex; align-items: center; justify-content: flex-end; min-width: 120px;
    padding: 14px 18px; background: var(--olive); color: #fff; font-size: 14px; font-weight: 800;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* ─── Pie ─── */
  .r-foot {
    background: var(--ink); color: #cfcfc6; padding: 20px 30px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px;
    position: relative; overflow: hidden;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .r-foot .q-ic { width: 13px; height: 13px; color: var(--olive); flex: none; }
  .r-row { display: flex; align-items: flex-start; gap: 7px; font-size: 8.5px; line-height: 1.5; margin-bottom: 6px; position: relative; z-index: 1; }
  .r-row strong { color: #fff; font-weight: 700; }
  .r-foot-mark { position: absolute; right: 10px; bottom: -14px; width: 132px; height: auto; opacity: 0.1; z-index: 0; }

  /* ─── Barra de impresión (solo pantalla) ─── */
  .r-printbar { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px 4px; text-align: center; }
  .r-printbar button {
    background: var(--olive); color: #fff; border: none; padding: 11px 26px; font-size: 13px;
    font-weight: 700; border-radius: 8px; cursor: pointer; font-family: inherit; letter-spacing: 0.3px;
  }
  .r-printbar button:hover { background: var(--olive-deep); }
  .r-printbar span { font-size: 11px; color: #4b4b44; }

  @media print {
    html, body { background: #fff; width: 210mm; }
    .r-noprint { display: none !important; }
    .r-sheet { width: 210mm; margin: 0; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .r-intro, .r-table, .r-total, .r-foot { break-inside: avoid; }
    @page { size: A4; margin: 0; }
  }

  @media screen and (max-width: 840px) {
    .r-sheet { width: 100%; min-height: 0; }
    .r-intro { grid-template-columns: 1fr; }
    .r-rule-v { display: none; }
    .r-foot { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
${printBar}
<div class="r-sheet">

  <header class="r-head">
    <div class="r-head__brand">${brandLogo({ dark: true, markSrc })}</div>
    <div class="r-head__seam"></div>
    <div class="r-head__meta">
      <div class="r-title">
        <h1>COMPROBANTE DE PAGO</h1>
        <span class="r-num">${esc(number)}</span>
      </div>
      <div class="r-facts">
        <div class="r-fact"><div class="r-fact__k">${icon('calendar')} FECHA</div><div class="r-fact__v">${esc(formatLongDate(income.fecha))}</div></div>
        <div class="r-fact"><div class="r-fact__k">${icon('doc')} ELABORADO POR</div><div class="r-fact__v">${esc(COMPANY.brandName)}</div></div>
      </div>
    </div>
  </header>

  <div class="r-body">
    ${monogram('r-watermark', markSrc)}

    <div class="r-intro">
      <div class="r-client">
        <div class="r-h">${icon('user')} Datos del cliente</div>
        <dl>
          <div class="r-field">${icon('user')}<div><dt>Cliente:</dt><dd>${esc(clientName)}</dd></div></div>
          <div class="r-field">${icon('career')}<div><dt>Carrera:</dt><dd>${esc(career)}</dd></div></div>
          <div class="r-field">${icon('mail')}<div><dt>Correo:</dt><dd>${esc(income.lead_email || '—')}</dd></div></div>
          <div class="r-field">${icon('phone')}<div><dt>Teléfono:</dt><dd>${esc(income.lead_phone || '—')}</dd></div></div>
        </dl>
      </div>
      <div class="r-rule-v"></div>
      <div class="r-present">
        <div class="r-h">Presentación</div>
        <p>Estimados señores,</p>
        <p>Dejamos constancia del pago recibido por el concepto detallado a continuación. Agradecemos su confianza en ${esc(COMPANY.brandName)} y quedamos atentos a cualquier consulta.</p>
        <p>Atentamente,<br><span class="r-sign">${esc(COMPANY.brandName)}</span></p>
      </div>
      <div class="r-concept">
        <div class="r-concept__k">Concepto</div>
        <div class="r-concept__v">${esc(concept)}</div>
        ${income.banco ? `<div class="r-concept__k" style="margin-top:12px">Medio</div><div class="r-concept__v">${esc(income.banco)}</div>` : ''}
      </div>
    </div>

    <table class="r-table">
      <thead>
        <tr><th>Concepto / Descripción</th><th>Importe</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="r-concept-cell">${esc(concept)}</td>
          <td>${formatMoney(amount, currency)}</td>
        </tr>
        <tr>
          <td class="r-sub-k">SUBTOTAL</td>
          <td>${formatMoney(amount, currency)}</td>
        </tr>
        <tr>
          <td class="r-sub-k">DESCUENTO</td>
          <td>${formatMoney(discount, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="r-total">
      <div class="r-total__spacer"></div>
      <div class="r-total__k">MONTO TOTAL</div>
      <div class="r-total__v">${formatMoney(amount - discount, currency)}</div>
    </div>
  </div>

  <footer class="r-foot">
    <div>
      <div class="r-row">${icon('career')}<span><strong>${esc(COMPANY.legalName)}</strong></span></div>
      <div class="r-row">${icon('doc')}<span>RUC: ${esc(COMPANY.ruc)}</span></div>
    </div>
    <div>
      <div class="r-row">${icon('user')}<span>${esc(COMPANY.address)}<br>${esc(COMPANY.addressCity)}</span></div>
      <div class="r-row">${icon('phone')}<span>${esc(COMPANY.phone)}</span></div>
    </div>
    <div>
      <div class="r-row">${icon('mail')}<span>${esc(COMPANY.email)}</span></div>
      <div class="r-row">${icon('career')}<span>${esc(COMPANY.website)}</span></div>
    </div>
    ${monogram('r-foot-mark', markSrc)}
  </footer>

</div>
</body>
</html>`;
}
