/**
 * Catálogo de carreras administrable (`career_groups` + `careers`).
 *
 * Hasta ahora la lista de carreras vivía en `src/data/careers.js`, es decir en
 * el código del frontend: agregar una carrera ("Gestión Educativa", por
 * ejemplo) obligaba a editar el archivo, recompilar el build y desplegar. El
 * equipo comercial, que es quien descubre las carreras que faltan al hablar
 * con los leads, no podía hacerlo solo.
 *
 * Son dos tablas y no una porque la lista es larga y el `<select>` la pinta
 * agrupada (`<optgroup>`): el área ("Ingeniería y Tecnología") es un
 * encabezado con su propio orden, y la carrera es lo único que se guarda en el
 * lead, en el proyecto y en el contrato. Por eso `careers.name` es único en
 * todo el catálogo y no solo dentro de su grupo: dos áreas distintas no pueden
 * ofrecer el mismo nombre, o al leer un lead no se sabría de cuál vino.
 *
 * `is_active` existe para poder dejar de ofrecer una carrera sin borrarla: los
 * leads y proyectos que ya la usaron guardan el nombre como texto, así que
 * borrarla del catálogo no los rompe, pero tampoco deja rastro de por qué ese
 * nombre ya no aparece en la lista.
 *
 * Las filas se siembran acá (y no en `db/seeds/`) porque los seeds del
 * proyecto borran leads de prueba y no se corren contra datos reales: el
 * catálogo tiene que quedar completo con solo aplicar la migración.
 */

const INITIAL_CATALOG = [
  {
    label: 'Ingeniería y Tecnología',
    careers: [
      'Ingeniería de Sistemas y Computación',
      'Ingeniería de Software',
      'Ciencia de la Computación',
      'Ciencia de Datos e Inteligencia Artificial',
      'Ingeniería Industrial',
      'Ingeniería Civil',
      'Ingeniería Mecánica',
      'Ingeniería Mecatrónica',
      'Ingeniería Eléctrica',
      'Ingeniería Electrónica',
      'Ingeniería de Telecomunicaciones',
      'Ingeniería Química',
      'Ingeniería Textil y de Confecciones',
      'Ingeniería de Seguridad y Salud en el Trabajo'
    ]
  },
  {
    label: 'Minería, Geología y Energía',
    careers: [
      'Ingeniería de Minas',
      'Ingeniería Geológica',
      'Ingeniería Metalúrgica',
      'Ingeniería de Petróleo y Gas Natural',
      'Ingeniería Energética'
    ]
  },
  {
    label: 'Agraria, Ambiental y Alimentaria',
    careers: [
      'Ingeniería Agronómica',
      'Ingeniería Agrícola',
      'Ingeniería Agroindustrial',
      'Ingeniería Zootecnista',
      'Ingeniería Forestal',
      'Ingeniería Ambiental',
      'Ingeniería Pesquera y Acuicultura',
      'Ingeniería de Industrias Alimentarias',
      'Medicina Veterinaria'
    ]
  },
  {
    label: 'Ciencias de la Salud',
    careers: [
      'Medicina Humana',
      'Enfermería',
      'Obstetricia',
      'Odontología',
      'Psicología',
      'Farmacia y Bioquímica',
      'Tecnología Médica',
      'Nutrición y Dietética',
      'Terapia Física y Rehabilitación',
      'Salud Pública y Gestión en Salud'
    ]
  },
  {
    label: 'Ciencias Empresariales',
    careers: [
      'Administración de Empresas',
      'Administración y Negocios Internacionales',
      'Contabilidad y Finanzas',
      'Economía',
      'Marketing',
      'Gestión Pública',
      'Gestión del Talento Humano',
      'Turismo y Hotelería'
    ]
  },
  {
    label: 'Derecho y Ciencias Sociales',
    careers: [
      'Derecho',
      'Ciencia Política y Gobierno',
      'Relaciones Internacionales',
      'Sociología',
      'Antropología',
      'Trabajo Social'
    ]
  },
  {
    label: 'Educación y Humanidades',
    careers: [
      'Educación Inicial',
      'Educación Primaria',
      'Educación Secundaria',
      'Educación Especial',
      'Educación Física y Deportes',
      'Gestión Educativa',
      'Ciencias de la Comunicación',
      'Periodismo',
      'Literatura y Lingüística',
      'Filosofía',
      'Historia',
      'Traducción e Interpretación'
    ]
  },
  {
    label: 'Arquitectura, Diseño y Artes',
    careers: [
      'Arquitectura y Urbanismo',
      'Diseño Gráfico y Comunicación Visual',
      'Diseño de Interiores',
      'Artes Escénicas',
      'Artes Plásticas y Visuales'
    ]
  },
  {
    label: 'Ciencias Básicas',
    careers: [
      'Matemática',
      'Estadística',
      'Física',
      'Química',
      'Biología',
      'Biotecnología',
      'Geografía y Medio Ambiente'
    ]
  }
];

export async function up(knex) {
  await knex.schema.createTable('career_groups', (table) => {
    table.increments('id').primary();
    table.string('label', 150).notNullable().unique();
    table.integer('position').unsigned().notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('careers', (table) => {
    table.increments('id').primary();
    table.integer('group_id').unsigned().notNullable()
      .references('id').inTable('career_groups').onDelete('CASCADE');
    table.string('name', 150).notNullable().unique();
    table.integer('position').unsigned().notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // El único acceso es "las carreras de este grupo, en orden".
    table.index(['group_id', 'position']);
  });

  for (const [groupIndex, group] of INITIAL_CATALOG.entries()) {
    const [groupId] = await knex('career_groups').insert({ label: group.label, position: groupIndex });
    await knex('careers').insert(
      group.careers.map((name, index) => ({ group_id: groupId, name, position: index }))
    );
  }

  // Gestionar el catálogo es una herramienta aparte: cualquiera con
  // `leads.view` elige carreras, pero renombrar o quitar una cambia lo que ve
  // todo el equipo (y el evaluador público), así que va con su propio permiso.
  const existing = await knex('permissions').where({ key: 'careers.manage' }).first();
  if (!existing) {
    const [permissionId] = await knex('permissions').insert({ key: 'careers.manage', label: 'Catálogo de Carreras' });
    const adminRole = await knex('roles').where({ name: 'Administrador' }).first();
    if (adminRole) await knex('role_permissions').insert({ role_id: adminRole.id, permission_id: permissionId });
  }
}

export async function down(knex) {
  await knex('permissions').where({ key: 'careers.manage' }).del();
  await knex.schema.dropTableIfExists('careers');
  await knex.schema.dropTableIfExists('career_groups');
}
