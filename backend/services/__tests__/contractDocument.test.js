import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContractDocument,
  clauseOrdinal,
  fillPlaceholders,
  formatAmountLegal,
  numberToWords
} from '../contractDocument.js';

test('numberToWords escribe montos en letras con las formas correctas', () => {
  assert.equal(numberToWords(0), 'cero');
  assert.equal(numberToWords(100), 'cien');
  assert.equal(numberToWords(101), 'ciento uno');
  assert.equal(numberToWords(5200), 'cinco mil doscientos');
  assert.equal(numberToWords(21000), 'veintiún mil');
  assert.equal(numberToWords(31500), 'treinta y un mil quinientos');
  assert.equal(numberToWords(1000000), 'un millón');
  assert.equal(numberToWords(2345678), 'dos millones trescientos cuarenta y cinco mil seiscientos setenta y ocho');
});

test('formatAmountLegal arma el monto en cifras y letras', () => {
  assert.equal(formatAmountLegal(5200, 'PEN'), 'S/ 5,200.00 (CINCO MIL DOSCIENTOS CON 00/100 SOLES)');
  assert.equal(formatAmountLegal('1500.5', 'USD'), 'US$ 1,500.50 (MIL QUINIENTOS CON 50/100 DÓLARES AMERICANOS)');
  assert.equal(formatAmountLegal(99.995), 'S/ 100.00 (CIEN CON 00/100 SOLES)');
  assert.equal(formatAmountLegal(null), null);
});

test('clauseOrdinal numera las cláusulas como en un contrato', () => {
  assert.equal(clauseOrdinal(1), 'PRIMERA');
  assert.equal(clauseOrdinal(10), 'DÉCIMA');
  assert.equal(clauseOrdinal(12), 'DÉCIMA SEGUNDA');
  assert.equal(clauseOrdinal(20), 'VIGÉSIMA');
});

test('fillPlaceholders reemplaza, deja línea para lo que falta y escapa HTML', () => {
  const html = fillPlaceholders('Cliente {{cliente}}, DNI {{dni}}, {{desconocido}} <b>', { cliente: 'Ana <x>', dni: null });
  assert.equal(html, 'Cliente <strong>Ana &lt;x&gt;</strong>, DNI ____________________, {{desconocido}} &lt;b&gt;');
});

test('buildContractDocument incluye las cláusulas numeradas y marca el borrador', () => {
  const html = buildContractDocument({
    id: 7,
    created_at: '2026-09-18T10:00:00Z',
    intro: 'Conste que {{cliente}} contrata.',
    closing: 'Firmado el {{fecha}}.',
    title: 'CONTRATO DE LOCACIÓN DE SERVICIOS',
    status: 'borrador',
    client_name: 'Carlos Flores',
    total_amount: '3000.00',
    currency: 'PEN',
    contract_date: '2026-09-18',
    clauses: [{ title: 'OBJETO', body: 'Servicio para {{cliente}}.' }, { title: 'PLAZO', body: 'Un año.' }]
  });
  assert.match(html, /CTR-2026-0007/);
  assert.match(html, /PRIMERA:<\/span> OBJETO/);
  assert.match(html, /SEGUNDA:<\/span> PLAZO/);
  assert.match(html, /Servicio para <strong>Carlos Flores<\/strong>/);
  assert.match(html, /Conste que <strong>Carlos Flores<\/strong> contrata\./);
  assert.match(html, /BORRADOR/);
  assert.match(html, /18 de se(p)?tiembre de 2026/);
});

test('buildContractDocument incluye la firma del locador salvo en contratos anulados', () => {
  const base = { id: 1, title: 'CONTRATO', clauses: [] };
  assert.match(buildContractDocument({ ...base, status: 'borrador' }), /<img src="data:image\/png;base64,/);
  assert.match(buildContractDocument({ ...base, status: 'firmado' }), /<img src="data:image\/png;base64,/);
  assert.doesNotMatch(buildContractDocument({ ...base, status: 'anulado' }), /<img src="data:image/);
});
