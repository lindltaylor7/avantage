/**
 * Documento imprimible (A4) de un contrato, con la marca de Avantage Group.
 * Se abre en una pestaña con el botón "Imprimir / Guardar como PDF": el
 * diálogo de impresión del navegador produce el PDF, sin depender de un
 * motor de PDF en el servidor (el hosting compartido no puede correr uno).
 *
 * A diferencia de la cotización (una sola hoja con bandas de color), un
 * contrato ocupa varias páginas: los márgenes van en `@page` para que el
 * texto fluya página a página con el mismo margen en cada una.
 */
import { COMPANY, agMarkPaths, esc } from './quotationDocument.js';
import { CONTRACT_TEMPLATES } from './contractTemplates.js';

const BLANK = '____________________';

const ORDINALS = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA'];
const TENS_ORDINALS = { 10: 'DÉCIMA', 20: 'VIGÉSIMA', 30: 'TRIGÉSIMA' };

/** 1 → "PRIMERA", 12 → "DÉCIMA SEGUNDA", 20 → "VIGÉSIMA". */
export function clauseOrdinal(n) {
  if (n < 10) return ORDINALS[n - 1];
  const tens = Math.floor(n / 10) * 10;
  if (!TENS_ORDINALS[tens]) return `CLÁUSULA ${n}`;
  return n % 10 ? `${TENS_ORDINALS[tens]} ${ORDINALS[(n % 10) - 1]}` : TENS_ORDINALS[tens];
}

const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below1000(n) {
  if (n === 100) return 'cien';
  const rest = n % 100;
  const restWords = rest < 30 ? UNITS[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` y ${UNITS[rest % 10]}` : ''}`;
  return [HUNDREDS[Math.floor(n / 100)], restWords].filter(Boolean).join(' ');
}

// "uno" pierde la -o delante de mil/millones: "veintiún mil", "treinta y un mil".
function apocope(words) {
  return words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

/** Parte entera en letras: 5200 → "cinco mil doscientos". */
export function numberToWords(value) {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const units = n % 1000;
  const parts = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(numberToWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(below1000(thousands))} mil`);
  if (units) parts.push(below1000(units));
  return parts.join(' ');
}

/** 5200 → "S/ 5,200.00 (CINCO MIL DOSCIENTOS CON 00/100 SOLES)". */
export function formatAmountLegal(amount, currency = 'PEN') {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const totalCents = Math.round(value * 100);
  const cents = String(totalCents % 100).padStart(2, '0');
  const symbol = currency === 'USD' ? 'US$' : 'S/';
  const currencyWords = currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
  const figure = (totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${figure} (${numberToWords(Math.floor(totalCents / 100)).toUpperCase()} CON ${cents}/100 ${currencyWords})`;
}

function formatLongDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatContractNumber(contract) {
  const year = String(contract.created_at ? new Date(contract.created_at).getFullYear() : new Date().getFullYear());
  return `CTR-${year}-${String(contract.id).padStart(4, '0')}`;
}

/** Valores de los marcadores {{...}}. Un dato que falta queda como línea para llenar a mano. */
export function contractPlaceholders(contract) {
  return {
    empresa: COMPANY.legalName,
    ruc: COMPANY.ruc,
    domicilio_empresa: `${COMPANY.address}, ${COMPANY.addressCity}`,
    representante: contract.representative_name,
    cliente: contract.client_name,
    dni: contract.client_dni,
    domicilio: contract.client_address,
    correo: contract.client_email,
    telefono: contract.client_phone,
    servicio: contract.service_description,
    monto: formatAmountLegal(contract.total_amount, contract.currency),
    ciudad: contract.city,
    fecha: formatLongDate(contract.contract_date)
  };
}

/** Escapa el texto y reemplaza los marcadores; los desconocidos se dejan tal cual. */
export function fillPlaceholders(text, values) {
  return esc(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => {
    if (!(key in values)) return match;
    const value = values[key];
    return value ? `<strong>${esc(value)}</strong>` : BLANK;
  });
}

function paragraphs(text, values) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${fillPlaceholders(p, values).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const WATERMARKS = { borrador: 'BORRADOR', anulado: 'ANULADO' };

export function buildContractDocument(contract) {
  const template = CONTRACT_TEMPLATES[contract.template_key] || {};
  const values = contractPlaceholders(contract);
  const number = formatContractNumber(contract);
  const watermark = WATERMARKS[contract.status];

  const clauses = (contract.clauses || []).map((clause, i) => `
    <section class="c-clause">
      <h3><span>${clauseOrdinal(i + 1)}:</span> ${esc(clause.title)}</h3>
      ${paragraphs(clause.body, values)}
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(number)} — ${esc(contract.client_name || 'Contrato')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&family=Source+Serif+4:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e9e8e1; color: #1f1f1c; font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; font-variant-numeric: lining-nums; }

  .c-sheet { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto 24px; padding: 22mm 20mm 20mm; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,0.12); }
  .c-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0;
    font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 96pt; letter-spacing: 8px; color: rgba(178,58,44,0.08); transform: rotate(-32deg); }
  .c-content { position: relative; z-index: 1; }

  .c-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; margin-bottom: 18px; border-bottom: 2px solid #8a9b30; font-family: 'Montserrat', sans-serif; }
  .c-brand { display: flex; align-items: center; gap: 10px; }
  .c-brand svg { width: 42px; height: 35px; }
  .c-brand strong { display: block; font-size: 12pt; letter-spacing: 2px; }
  .c-brand small { font-size: 7.5pt; color: #5d5e51; letter-spacing: 0.4px; }
  .c-number { text-align: right; font-size: 8pt; color: #5d5e51; }
  .c-number b { display: block; font-size: 10pt; color: #1f1f1c; }

  h1 { font-family: 'Montserrat', sans-serif; font-size: 13pt; font-weight: 800; text-align: center; letter-spacing: 0.6px; margin: 4px 0 18px; }
  p { text-align: justify; margin-bottom: 8px; }
  .c-intro { margin-bottom: 14px; }
  .c-clause { margin-bottom: 12px; }
  .c-clause h3 { font-family: 'Montserrat', sans-serif; font-size: 9.5pt; font-weight: 700; margin-bottom: 5px; text-transform: uppercase; break-after: avoid; }
  .c-clause h3 span { color: #68761f; }
  .c-closing { margin-top: 16px; }

  .c-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28mm; margin-top: 30mm; break-inside: avoid; }
  .c-sign { text-align: center; font-size: 9.5pt; }
  .c-sign i { display: block; border-top: 1px solid #1f1f1c; margin-bottom: 6px; }
  .c-sign b { display: block; font-family: 'Montserrat', sans-serif; font-size: 9pt; }

  .c-printbar { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px; font-family: 'Montserrat', sans-serif; }
  .c-printbar button { background: #8a9b30; color: #fff; border: none; padding: 11px 26px; font: 700 13px 'Montserrat', sans-serif; border-radius: 8px; cursor: pointer; }
  .c-printbar button:hover { background: #68761f; }
  .c-printbar span { font-size: 11px; color: #4b4b44; }

  @page { size: A4; margin: 22mm 20mm 20mm; }
  @media print {
    body { background: #fff; }
    .c-noprint { display: none !important; }
    .c-sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .c-head { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media screen and (max-width: 840px) {
    .c-sheet { width: 100%; min-height: 0; padding: 16px; }
  }
</style>
</head>
<body>
<div class="c-printbar c-noprint">
  <button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button>
  <span>En el diálogo elige “Guardar como PDF”, tamaño A4 y desactiva “Encabezados y pies de página”.</span>
</div>
<article class="c-sheet">
  ${watermark ? `<div class="c-watermark" aria-hidden="true">${watermark}</div>` : ''}
  <div class="c-content">
    <header class="c-head">
      <div class="c-brand">
        <svg viewBox="0 0 70 58" aria-hidden="true">${agMarkPaths()}</svg>
        <div><strong>AVANTAGE GROUP</strong><small>${esc(COMPANY.legalName)} · RUC ${esc(COMPANY.ruc)}</small></div>
      </div>
      <div class="c-number">Contrato<b>${esc(number)}</b></div>
    </header>

    <h1>${esc(contract.title || template.title || 'CONTRATO')}</h1>
    ${template.intro ? `<div class="c-intro">${paragraphs(template.intro, values)}</div>` : ''}
    ${clauses}
    ${template.closing ? `<div class="c-closing">${paragraphs(template.closing, values)}</div>` : ''}

    <div class="c-signatures">
      <div class="c-sign"><i></i><b>EL LOCADOR</b>${esc(COMPANY.legalName)}<br>RUC ${esc(COMPANY.ruc)}<br>${esc(contract.representative_name || 'Representante legal')}</div>
      <div class="c-sign"><i></i><b>EL CLIENTE</b>${esc(contract.client_name || BLANK)}<br>DNI ${esc(contract.client_dni || BLANK)}</div>
    </div>
  </div>
</article>
</body>
</html>`;
}
