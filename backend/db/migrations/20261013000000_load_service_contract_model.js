/**
 * Carga el modelo real de contrato de locación de servicios (14 cláusulas con
 * subcláusulas, cronograma de pagos, cuentas de abono y cronograma de
 * entregas) desde backend/db/data/serviceContractModel.js.
 *
 * El tipo que había era un texto genérico de arranque, marcado en su propio
 * archivo como "punto de partida que debe revisar el área legal". Este lo
 * reemplaza — PERO solo si nadie lo tocó desde el panel: sobrescribir las
 * cláusulas de un contrato que alguien ya adaptó a mano sería destruir texto
 * legal sin aviso. Se compara contra los títulos con los que se cargó
 * originalmente; si no coinciden (alguien editó, agregó o quitó cláusulas),
 * el modelo entra como un tipo NUEVO y el suyo queda intacto.
 *
 * Los contratos ya emitidos no se tocan en ningún caso: copian sus cláusulas
 * al crearse, justamente para que editar un tipo no los altere.
 */
import { SERVICE_CONTRACT_MODEL } from '../data/serviceContractModel.js';

// Títulos con los que la migración 20261008000000 cargó el tipo genérico.
// Si el tipo todavía tiene exactamente estos, nunca se editó.
const UNTOUCHED_CLAUSE_TITLES = [
  'OBJETO DEL CONTRATO',
  'OBLIGACIONES DEL LOCADOR',
  'OBLIGACIONES DEL CLIENTE',
  'CONTRAPRESTACIÓN Y FORMA DE PAGO',
  'PLAZO',
  'CONFIDENCIALIDAD Y DATOS PERSONALES',
  'RESOLUCIÓN DEL CONTRATO',
  'DOMICILIO Y COMUNICACIONES',
  'SOLUCIÓN DE CONTROVERSIAS'
];

async function insertClauses(knex, templateId) {
  await knex('contract_template_clauses').where({ template_id: templateId }).del();
  await knex('contract_template_clauses').insert(
    SERVICE_CONTRACT_MODEL.clauses.map((c, i) => ({
      template_id: templateId,
      position: i + 1,
      title: c.title,
      body: c.body
    }))
  );
}

export async function up(knex) {
  const generic = await knex('contract_templates')
    .where({ title: 'CONTRATO DE LOCACIÓN DE SERVICIOS' })
    .orderBy('id')
    .first();

  if (generic) {
    const clauses = await knex('contract_template_clauses')
      .where({ template_id: generic.id })
      .orderBy('position')
      .select('title');
    const titles = clauses.map((c) => c.title);
    const untouched = titles.length === UNTOUCHED_CLAUSE_TITLES.length
      && titles.every((t, i) => t === UNTOUCHED_CLAUSE_TITLES[i]);

    if (untouched) {
      await knex('contract_templates').where({ id: generic.id }).update({
        label: SERVICE_CONTRACT_MODEL.label,
        title: SERVICE_CONTRACT_MODEL.title,
        intro: SERVICE_CONTRACT_MODEL.intro,
        closing: SERVICE_CONTRACT_MODEL.closing,
        updated_at: knex.fn.now()
      });
      await insertClauses(knex, generic.id);
      return;
    }
  }

  const [templateId] = await knex('contract_templates').insert({
    label: SERVICE_CONTRACT_MODEL.label,
    title: SERVICE_CONTRACT_MODEL.title,
    intro: SERVICE_CONTRACT_MODEL.intro,
    closing: SERVICE_CONTRACT_MODEL.closing
  });
  await insertClauses(knex, templateId);
}

export async function down(knex) {
  // No se restaura el texto genérico anterior: era provisional y volver a
  // ponerlo en lugar del modelo legal vigente sería peor que dejar el tipo
  // como está. Solo se borra el tipo si esta migración lo creó (no tiene
  // contratos emitidos apuntando a él).
  const template = await knex('contract_templates')
    .where({ label: SERVICE_CONTRACT_MODEL.label })
    .first();
  if (!template) return;

  const [{ n }] = await knex('contracts').where({ template_id: template.id }).count('* as n');
  if (Number(n) > 0) return;

  await knex('contract_template_clauses').where({ template_id: template.id }).del();
  await knex('contract_templates').where({ id: template.id }).del();
}
