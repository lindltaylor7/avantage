import { readFileSync } from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BRAND_MARK_PATH, COMPANY, formatLongDate } from './quotationDocument.js';
import { formatReceiptNumber, receiptConcept } from './paymentReceiptDocument.js';

/**
 * Comprobante de pago en PDF.
 *
 * El comprobante ya existía como HTML (`paymentReceiptDocument.js`) para
 * imprimirlo desde el navegador, pero el correo lo llevaba en el cuerpo: el
 * cliente no se quedaba con un archivo, y reenviarlo o adjuntarlo a un trámite
 * era imposible. Acá se dibuja el MISMO documento como PDF de una página, que
 * es lo que se adjunta al correo y lo que ve la vista previa antes de enviar.
 *
 * Se dibuja con `pdf-lib` (JavaScript puro) en vez de convertir el HTML con un
 * navegador headless: el hosting compartido no corre Chromium, y una
 * dependencia con binarios nativos no sobrevive al despliegue por Git.
 * La contrapartida es que la maqueta se declara acá en coordenadas — por eso
 * las medidas viven todas juntas en `L`, para poder moverlas sin cazarlas por
 * el archivo.
 */

/* Paleta de marca, en el espacio de color del PDF. */
const INK = rgb(0.122, 0.122, 0.11);
const OLIVE = rgb(0.541, 0.608, 0.188);
const OLIVE_DEEP = rgb(0.408, 0.463, 0.122);
const PAPER = rgb(0.969, 0.965, 0.937);
const SAND = rgb(0.925, 0.914, 0.863);
const RULE = rgb(0.863, 0.855, 0.788);
const MUTED = rgb(0.365, 0.369, 0.318);
const WHITE = rgb(1, 1, 1);

/* A4 en puntos, y la maqueta en una sola tabla. */
const L = {
  width: 595.28,
  height: 841.89,
  margin: 38,
  headHeight: 96,
  footHeight: 78
};

const CURRENCY_SYMBOL = { PEN: 'S/', USD: 'US$' };

function money(amount, currency = 'PEN') {
  const number = Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${CURRENCY_SYMBOL[currency] || 'S/'} ${number}`;
}

/**
 * Las fuentes estándar del PDF sólo cubren WinAnsi: un carácter fuera de esa
 * tabla (una raya larga, unas comillas curvas pegadas desde Word) hace fallar
 * el dibujado entero. Se normaliza antes de escribir, no después de romperse.
 */
function ansi(text) {
  return String(text ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

/** Corta el texto para que no se salga del ancho disponible. */
function fit(text, font, size, maxWidth) {
  let value = ansi(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

/** Parte un párrafo en líneas que quepan en `maxWidth`. */
function wrap(text, font, size, maxWidth) {
  const words = ansi(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {object} income Fila de `finance_income` con los datos del lead ya
 *   unidos (lead_name, lead_email, lead_phone, lead_career).
 * @returns {Promise<Buffer>} El PDF listo para adjuntar o descargar.
 */
export async function buildPaymentReceiptPdf({ income }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([L.width, L.height]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const number = formatReceiptNumber(income);
  const concept = receiptConcept(income);
  const amount = Number(income.monto || 0);
  const discount = 0;

  pdf.setTitle(`Comprobante de pago ${number}`);
  pdf.setAuthor(COMPANY.legalName);
  pdf.setSubject(`${concept} - ${money(amount)}`);

  const left = L.margin;
  const right = L.width - L.margin;
  const contentWidth = right - left;

  // Fondo de la hoja: el mismo crema del documento impreso.
  page.drawRectangle({ x: 0, y: 0, width: L.width, height: L.height, color: PAPER });

  /* ─────────────────────────── Encabezado ─────────────────────────── */
  const headTop = L.height - L.headHeight;
  page.drawRectangle({ x: 0, y: headTop, width: L.width, height: L.headHeight, color: INK });
  // Franja olivo de la costura diagonal del documento impreso.
  page.drawRectangle({ x: L.width * 0.52, y: headTop, width: 10, height: L.headHeight, color: OLIVE });

  let logoWidth = 0;
  try {
    const mark = await pdf.embedPng(readFileSync(BRAND_MARK_PATH));
    const scaled = mark.scaleToFit(46, 46);
    page.drawImage(mark, { x: left, y: headTop + (L.headHeight - scaled.height) / 2, width: scaled.width, height: scaled.height });
    logoWidth = scaled.width + 12;
  } catch {
    // Sin el PNG el documento sigue saliendo: solo pierde el símbolo.
  }

  page.drawText('AVANTAGE', { x: left + logoWidth, y: headTop + 56, size: 17, font: bold, color: WHITE, characterSpacing: 3.5 });
  page.drawText('GROUP', { x: left + logoWidth, y: headTop + 42, size: 8, font: bold, color: rgb(0.81, 0.81, 0.78), characterSpacing: 3 });
  page.drawText(ansi(COMPANY.tagline), { x: left + logoWidth, y: headTop + 28, size: 5.6, font: regular, color: rgb(0.796, 0.839, 0.604), characterSpacing: 0.6 });

  const titleX = L.width * 0.52 + 26;
  page.drawText('COMPROBANTE', { x: titleX, y: headTop + 58, size: 17, font: bold, color: OLIVE });
  page.drawText('DE PAGO', { x: titleX, y: headTop + 40, size: 17, font: bold, color: OLIVE });
  page.drawText(number, { x: titleX, y: headTop + 24, size: 9, font: bold, color: WHITE, characterSpacing: 1.4 });
  page.drawLine({
    start: { x: titleX, y: headTop + 18 },
    end: { x: titleX + bold.widthOfTextAtSize(number, 9) + 8, y: headTop + 18 },
    thickness: 1.4,
    color: OLIVE
  });

  /* ──────────────────── Datos del cliente / presentación ──────────── */
  let y = headTop - 34;
  const columnGap = 22;
  const clientWidth = contentWidth * 0.34;
  const presentX = left + clientWidth + columnGap;
  const presentWidth = contentWidth * 0.38;
  const conceptX = presentX + presentWidth + columnGap;

  page.drawText('DATOS DEL CLIENTE', { x: left, y, size: 9, font: bold, color: OLIVE_DEEP, characterSpacing: 0.6 });
  page.drawText('PRESENTACION', { x: presentX, y, size: 9, font: bold, color: OLIVE_DEEP, characterSpacing: 0.6 });
  page.drawText('CONCEPTO', { x: conceptX, y, size: 9, font: bold, color: OLIVE_DEEP, characterSpacing: 0.6 });

  // Filete vertical olivo entre los datos y la presentación, como en el HTML.
  page.drawRectangle({ x: presentX - columnGap / 2, y: y - 92, width: 1.4, height: 104, color: OLIVE });

  const clientRows = [
    ['Cliente:', income.lead_name || 'Cliente'],
    ['Carrera:', income.lead_career || '—'],
    ['Correo:', income.lead_email || '—'],
    ['Telefono:', income.lead_phone || '—']
  ];
  let rowY = y - 16;
  for (const [label, value] of clientRows) {
    page.drawText(ansi(label), { x: left, y: rowY, size: 8.5, font: bold, color: INK });
    const labelWidth = bold.widthOfTextAtSize(ansi(label), 8.5) + 5;
    page.drawText(fit(value, regular, 8.5, clientWidth - labelWidth), {
      x: left + labelWidth, y: rowY, size: 8.5, font: regular, color: MUTED
    });
    rowY -= 15;
  }

  const presentation = [
    'Estimados senores,',
    `Dejamos constancia del pago recibido por el concepto detallado a continuacion. Agradecemos su confianza en ${COMPANY.brandName} y quedamos atentos a cualquier consulta.`,
    'Atentamente,'
  ];
  let presentY = y - 16;
  for (const paragraph of presentation) {
    for (const line of wrap(paragraph, regular, 8.2, presentWidth)) {
      page.drawText(line, { x: presentX, y: presentY, size: 8.2, font: regular, color: MUTED });
      presentY -= 11.5;
    }
    presentY -= 3;
  }
  page.drawText(ansi(COMPANY.brandName), { x: presentX, y: presentY, size: 8.5, font: bold, color: INK });

  page.drawText(fit(concept, bold, 8.5, contentWidth - (conceptX - left)), {
    x: conceptX, y: y - 16, size: 8.5, font: bold, color: MUTED
  });
  if (income.banco) {
    page.drawText('MEDIO', { x: conceptX, y: y - 40, size: 9, font: bold, color: OLIVE_DEEP, characterSpacing: 0.6 });
    page.drawText(fit(income.banco, regular, 8.5, contentWidth - (conceptX - left)), {
      x: conceptX, y: y - 56, size: 8.5, font: regular, color: MUTED
    });
  }

  /* ─────────────────────────── Fecha y emisor ─────────────────────── */
  y = rowY - 18;
  page.drawText(`FECHA: ${ansi(formatLongDate(income.fecha))}`, { x: left, y, size: 8, font: bold, color: MUTED });
  page.drawText(`ELABORADO POR: ${ansi(COMPANY.brandName)}`, { x: presentX, y, size: 8, font: bold, color: MUTED });

  /* ───────────────────────── Tabla de importes ────────────────────── */
  y -= 26;
  const rowHeight = 26;
  const amountColumn = 150;

  page.drawRectangle({ x: left, y: y - rowHeight + 8, width: contentWidth, height: rowHeight, color: OLIVE });
  page.drawText('CONCEPTO / DESCRIPCION', { x: left + 12, y: y - 9, size: 9, font: bold, color: WHITE, characterSpacing: 0.6 });
  page.drawText('IMPORTE', {
    x: right - 12 - bold.widthOfTextAtSize('IMPORTE', 9),
    y: y - 9, size: 9, font: bold, color: WHITE, characterSpacing: 0.6
  });

  const rows = [
    { label: concept, value: money(amount, 'PEN'), strong: true },
    { label: 'SUBTOTAL', value: money(amount, 'PEN'), alignRight: true },
    { label: 'DESCUENTO', value: money(discount, 'PEN'), alignRight: true }
  ];
  let tableY = y - rowHeight + 8;
  for (const row of rows) {
    tableY -= rowHeight;
    page.drawRectangle({ x: left, y: tableY, width: contentWidth, height: rowHeight, color: WHITE, borderColor: RULE, borderWidth: 0.7 });
    const font = row.strong ? bold : bold;
    const text = fit(row.label, font, 8.8, contentWidth - amountColumn - 24);
    const textX = row.alignRight
      ? right - amountColumn - 12 - font.widthOfTextAtSize(text, 8.8)
      : left + 12;
    page.drawText(text, { x: textX, y: tableY + 9, size: 8.8, font, color: INK });
    page.drawText(row.value, {
      x: right - 12 - bold.widthOfTextAtSize(row.value, 8.8),
      y: tableY + 9, size: 8.8, font: bold, color: INK
    });
  }

  /* ──────────────────────────── Monto total ───────────────────────── */
  tableY -= rowHeight + 4;
  const totalKeyWidth = contentWidth - amountColumn;
  page.drawRectangle({ x: left, y: tableY, width: totalKeyWidth, height: rowHeight + 6, color: SAND });
  page.drawRectangle({ x: left + totalKeyWidth, y: tableY, width: amountColumn, height: rowHeight + 6, color: OLIVE });
  page.drawText('MONTO TOTAL', {
    x: left + totalKeyWidth - 12 - bold.widthOfTextAtSize('MONTO TOTAL', 10.5),
    y: tableY + 11, size: 10.5, font: bold, color: INK, characterSpacing: 0.5
  });
  const totalText = money(amount - discount, 'PEN');
  page.drawText(totalText, {
    x: left + totalKeyWidth + (amountColumn - bold.widthOfTextAtSize(totalText, 12)) / 2,
    y: tableY + 10, size: 12, font: bold, color: WHITE
  });

  /* ─────────────────────────────── Pie ────────────────────────────── */
  page.drawRectangle({ x: 0, y: 0, width: L.width, height: L.footHeight, color: INK });
  const footColumn = contentWidth / 3;
  const footLines = [
    [COMPANY.legalName, `RUC: ${COMPANY.ruc}`],
    [COMPANY.address, `${COMPANY.addressCity}`, COMPANY.phone],
    [COMPANY.email, COMPANY.website]
  ];
  footLines.forEach((column, index) => {
    let footY = L.footHeight - 26;
    for (const line of column) {
      page.drawText(fit(line, regular, 7.6, footColumn - 14), {
        x: left + index * footColumn, y: footY, size: 7.6, font: index === 0 ? bold : regular, color: rgb(0.839, 0.839, 0.808)
      });
      footY -= 11;
    }
  });

  return Buffer.from(await pdf.save());
}

/** Nombre con el que el cliente recibe el archivo. */
export function receiptPdfFilename(income) {
  return `Comprobante-${formatReceiptNumber(income)}.pdf`;
}
