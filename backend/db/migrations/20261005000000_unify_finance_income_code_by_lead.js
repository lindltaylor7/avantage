/**
 * Unifica el código de los ingresos por cliente: todas las cuotas de un mismo
 * lead pasan a llevar el código de la más antigua.
 *
 * El equipo usa el código de INGRESOS para referirse a la persona ("el
 * 20260917-1"), no al asiento. Al partir un cierre en varias cuotas, cada una
 * recibía un código nuevo y el mismo cliente terminaba con dos códigos
 * distintos. `createIncome` ya reutiliza el del lead; esta migración arregla
 * lo que quedó registrado antes.
 */
export async function up(knex) {
  const rows = await knex('finance_income')
    .whereNotNull('lead_id')
    .orderBy('id', 'asc')
    .select('id', 'lead_id', 'code');

  const codeByLead = new Map();
  for (const row of rows) {
    if (!codeByLead.has(row.lead_id)) {
      codeByLead.set(row.lead_id, row.code);
      continue;
    }
    const code = codeByLead.get(row.lead_id);
    if (code && row.code !== code) {
      await knex('finance_income').where({ id: row.id }).update({ code });
    }
  }
}

/**
 * No se revierte: los códigos anteriores no quedan guardados en ningún sitio y
 * el código es una etiqueta de presentación, no una clave — nada lo referencia.
 */
export async function down() {}
