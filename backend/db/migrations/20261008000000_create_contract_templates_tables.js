/**
 * Tipos de contrato editables desde el panel (antes vivían en código):
 * - `contract_templates` + `contract_template_clauses`: cada tipo con su
 *   título, texto de apertura (comparecencia), cierre y cláusulas base. Se
 *   cargan con los tipos iniciales de backend/db/data/defaultContractTemplates.js.
 * - `contracts` pasa a guardar su propia copia de la apertura y el cierre
 *   (`intro`, `closing`) y referencia al tipo por `template_id`: editar o
 *   borrar un tipo no altera los contratos ya emitidos.
 */
import { CONTRACT_TEMPLATES } from '../data/defaultContractTemplates.js';

export async function up(knex) {
  await knex.schema.createTable('contract_templates', (table) => {
    table.increments('id').primary();
    table.string('label', 150).notNullable();
    table.string('title', 255).notNullable();
    table.text('intro').nullable();
    table.text('closing').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('contract_template_clauses', (table) => {
    table.increments('id').primary();
    table.integer('template_id').unsigned().notNullable()
      .references('id').inTable('contract_templates').onDelete('CASCADE');
    table.integer('position').unsigned().notNullable();
    table.string('title', 255).notNullable();
    table.text('body').notNullable();

    table.index(['template_id', 'position']);
  });

  await knex.schema.alterTable('contracts', (table) => {
    table.integer('template_id').unsigned().nullable()
      .references('id').inTable('contract_templates').onDelete('SET NULL');
    table.text('intro').nullable();
    table.text('closing').nullable();
  });

  for (const [key, template] of Object.entries(CONTRACT_TEMPLATES)) {
    const [templateId] = await knex('contract_templates').insert({
      label: template.label,
      title: template.title,
      intro: template.intro,
      closing: template.closing
    });
    await knex('contract_template_clauses').insert(
      template.clauses.map((c, i) => ({ template_id: templateId, position: i + 1, title: c.title, body: c.body }))
    );
    await knex('contracts').where({ template_key: key })
      .update({ template_id: templateId, intro: template.intro, closing: template.closing });
  }

  await knex.schema.alterTable('contracts', (table) => {
    table.dropColumn('template_key');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('contracts', (table) => {
    table.string('template_key', 40).notNullable().defaultTo('cliente');
  });
  await knex.schema.alterTable('contracts', (table) => {
    table.dropForeign('template_id');
    table.dropColumn('template_id');
    table.dropColumn('intro');
    table.dropColumn('closing');
  });
  await knex.schema.dropTableIfExists('contract_template_clauses');
  await knex.schema.dropTableIfExists('contract_templates');
}
