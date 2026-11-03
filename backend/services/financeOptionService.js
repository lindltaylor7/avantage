import { db } from '../db/connection.js';
import { BANCOS, DEFAULT_AREAS, loadBanks } from './financeLedgerService.js';

/**
 * Áreas de la empresa y cuentas (bancos) que el equipo agrega desde Finanzas.
 *
 * Las de fábrica viven en el código y no se pueden quitar; las nuevas van a
 * `finance_options`. Un banco nuevo vale en TODO el módulo (ingresos, libro
 * diario, gastos fijos, salarios, comisiones y su tarjeta en el Resumen): una
 * cuenta es una cuenta, y aceptarla en una pestaña y rechazarla en otra
 * obligaría a registrar el mismo dinero en dos cuentas distintas.
 */

export const OPTION_KINDS = ['area', 'banco'];

/** Lo que mide la columna donde termina guardado cada tipo. */
const MAX_LENGTH = { area: 120, banco: 20 };

const DEFAULTS = { area: DEFAULT_AREAS, banco: BANCOS };

/** Comparación sin mayúsculas, tildes ni espacios de más ("bbva" = "BBVA "). */
export function optionKey(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export class OptionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Las tablas que guardan un banco por nombre: borrar uno en uso las dejaría colgando. */
const BANK_USAGE = [
  ['finance_income', 'ingresos'],
  ['finance_journal', 'asientos del Libro Diario'],
  ['finance_fixed_expenses', 'gastos fijos'],
  ['finance_salaries', 'salarios'],
  ['sales_commissions', 'comisiones']
];

export class FinanceOptionService {
  /** Las listas completas (fábrica + agregadas) y las agregadas con su id, para poder quitarlas. */
  async list() {
    const custom = await db('finance_options')
      .select('id', 'kind', 'label')
      .orderBy('id', 'asc');
    const extra = (kind) => custom.filter((r) => r.kind === kind).map((r) => r.label);
    return {
      areas: [...DEFAULT_AREAS, ...extra('area')],
      banks: await loadBanks(),
      custom
    };
  }

  async add(kind, label, createdBy = null) {
    if (!OPTION_KINDS.includes(kind)) throw new OptionError('Tipo de opción inválido.');
    const clean = String(label || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new OptionError('Escribe un nombre.');
    if (clean.length > MAX_LENGTH[kind]) {
      throw new OptionError(`El nombre admite hasta ${MAX_LENGTH[kind]} caracteres.`);
    }

    const existing = await db('finance_options').where({ kind }).select('label');
    const taken = [...DEFAULTS[kind], ...existing.map((r) => r.label)]
      .find((l) => optionKey(l) === optionKey(clean));
    if (taken) throw new OptionError(`"${taken}" ya está en la lista.`, 409);

    const [id] = await db('finance_options').insert({ kind, label: clean, created_by: createdBy });
    return { id, kind, label: clean };
  }

  async remove(id) {
    const row = await db('finance_options').where({ id }).first();
    if (!row) throw new OptionError('La opción no existe.', 404);

    if (row.kind === 'banco') {
      const usos = [];
      for (const [table, nombre] of BANK_USAGE) {
        if (!(await db.schema.hasTable(table))) continue;
        const { n } = await db(table).where('banco', row.label).count('* as n').first();
        if (Number(n) > 0) usos.push(`${n} ${nombre}`);
      }
      if (usos.length > 0) {
        throw new OptionError(
          `No se puede quitar "${row.label}": está en uso (${usos.join(', ')}). Cambia esos registros a otra cuenta primero.`,
          409
        );
      }
    }
    // Un área es texto en cada asiento: quitarla de la lista no toca los que ya la usan.
    await db('finance_options').where({ id }).del();
    return row;
  }
}
