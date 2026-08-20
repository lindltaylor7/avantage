/**
 * Crea la tabla `whatsapp_bot_steps`: el guion editable de las preguntas que
 * TesiBot hace por WhatsApp. Cada fila es una de las 5 preguntas necesarias
 * para evaluar la tesis (problema, ámbito, nivel, carrera, correo); el
 * equipo puede reescribir el texto, reordenarlas, desactivarlas y definir un
 * valor por defecto que se usa si una pregunta queda desactivada (para que
 * el reporte final siempre tenga los datos que necesita).
 */
export function up(knex) {
  return knex.schema.createTable('whatsapp_bot_steps', (table) => {
    table.increments('id').primary();
    table.string('step_key', 30).notNullable().unique();
    table.integer('step_order').notNullable();
    table.text('question_text').notNullable();
    table.string('input_type', 20).notNullable(); // 'text' | 'choice'
    table.json('options').nullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.string('default_value', 255).nullable();
  }).then(() => {
    return knex('whatsapp_bot_steps').insert([
      {
        step_key: 'problem',
        step_order: 1,
        question_text: '¿Cuál es el problema, tecnología o tema principal que deseas investigar?',
        input_type: 'text',
        options: null,
        active: true,
        default_value: 'Tema de tesis por definir'
      },
      {
        step_key: 'location',
        step_order: 2,
        question_text: '¿En qué lugar, institución, región o sector específico de Perú planeas enfocar el estudio? (Ejemplo: "Región Ica", "Unidades mineras en Junín", "MYPEs de Gamarra")',
        input_type: 'text',
        options: null,
        active: true,
        default_value: 'Perú'
      },
      {
        step_key: 'level',
        step_order: 3,
        question_text: '¿Cuál es tu nivel académico?',
        input_type: 'choice',
        options: JSON.stringify([
          'Pregrado (Bachiller/Título)',
          'Posgrado (Maestría)',
          'Posgrado (Doctorado)'
        ]),
        active: true,
        default_value: 'Pregrado (Bachiller/Título)'
      },
      {
        step_key: 'field',
        step_order: 4,
        question_text: '¿A qué carrera perteneces?',
        input_type: 'choice',
        options: JSON.stringify([
          'Ingeniería de Sistemas y Computación',
          'Ingeniería Agrónoma y Agroindustrial',
          'Ciencias de la Salud y Medicina',
          'Administración, Negocios y Finanzas',
          'Derecho y Ciencias Políticas',
          'Educación y Psicología',
          'Ingeniería de Minas y Geología',
          'Ingeniería Ambiental y Ecología'
        ]),
        active: true,
        default_value: 'Ingeniería de Sistemas y Computación'
      },
      {
        step_key: 'email',
        step_order: 5,
        question_text: '¿A qué correo electrónico deseas que te enviemos el Reporte Completo de Viabilidad?',
        input_type: 'text',
        options: null,
        active: true,
        default_value: ''
      }
    ]);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('whatsapp_bot_steps');
}
