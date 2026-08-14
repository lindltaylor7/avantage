/**
 * Siembra las columnas del Kanban de Leads (antes en localStorage) y datos de
 * prueba: ~20 leads por columna, distribuidos en las 5 etapas por defecto del
 * funnel de ventas, para poder ver y probar el tablero con contenido real.
 *
 * Al borrar `leads`, MySQL elimina en cascada (ON DELETE CASCADE) los
 * proyectos y cotizaciones que dependían de esos leads; los proyectos
 * creados manualmente (lead_id nulo) no se ven afectados.
 */

const DEFAULT_COLUMNS = [
  { key: 'nuevo', label: 'Nuevo', icon: '🆕', color: '#105EFF', final: false, position: 0 },
  { key: 'contactado', label: 'Contactado', icon: '📞', color: '#8B5CF6', final: false, position: 1 },
  { key: 'en_negociacion', label: 'En Negociación', icon: '🤝', color: '#F59E0B', final: false, position: 2 },
  { key: 'ganado', label: 'Ganado', icon: '🏆', color: '#10B981', final: true, position: 3 },
  { key: 'perdido', label: 'Perdido', icon: '❌', color: '#F43F5E', final: false, position: 4 }
];

const LEADS_PER_COLUMN = 20;

const NOMBRES = [
  'Carlos', 'María', 'José', 'Ana', 'Luis', 'Rosa', 'Miguel', 'Carmen', 'Jorge', 'Patricia',
  'Fernando', 'Lucía', 'Ricardo', 'Elena', 'Diego', 'Valeria', 'Andrés', 'Camila', 'Roberto', 'Daniela',
  'Manuel', 'Fiorella', 'Alberto', 'Gabriela', 'Raúl', 'Milagros', 'Iván', 'Estefany', 'Marco', 'Katherine',
  'Sergio', 'Pamela', 'Cristian', 'Yesenia', 'Hugo', 'Vanessa', 'Renato', 'Sofía', 'Julio', 'Alejandra'
];

const APELLIDOS = [
  'García', 'Rodríguez', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Díaz', 'Flores', 'Torres',
  'Vargas', 'Castro', 'Rojas', 'Mendoza', 'Chávez', 'Ramos', 'Quispe', 'Huamán', 'Salazar', 'Paredes'
];

const UNIVERSIDADES = [
  'Universidad Nacional Mayor de San Marcos',
  'Pontificia Universidad Católica del Perú',
  'Universidad Nacional de Ingeniería',
  'Universidad de Lima',
  'Universidad San Ignacio de Loyola',
  'Universidad Nacional San Antonio Abad del Cusco',
  'Universidad Nacional de Trujillo',
  'Universidad Peruana Cayetano Heredia',
  'Universidad Nacional del Altiplano',
  'Universidad Continental',
  'Universidad César Vallejo',
  'Universidad Privada del Norte'
];

const CARRERAS = [
  'Ingeniería Civil', 'Ingeniería de Sistemas', 'Administración de Empresas', 'Derecho', 'Psicología',
  'Contabilidad', 'Ingeniería Industrial', 'Educación', 'Medicina Humana', 'Ingeniería Ambiental',
  'Arquitectura', 'Marketing', 'Enfermería', 'Economía', 'Ciencias de la Comunicación'
];

const NIVELES_ACADEMICOS = ['Pregrado (Bachiller/Título)', 'Maestría', 'Doctorado'];

const TEMAS_TESIS = [
  'Impacto del teletrabajo en la productividad laboral',
  'Estrategias de marketing digital para pymes',
  'Uso de energías renovables en zonas rurales',
  'Gestión de riesgos en proyectos de construcción',
  'Aplicación de inteligencia artificial en el diagnóstico médico',
  'Factores que influyen en la deserción universitaria',
  'Optimización de la cadena de suministro logística',
  'Percepción del consumidor sobre productos sostenibles',
  'Análisis financiero de pequeñas empresas familiares',
  'Impacto del cambio climático en la agricultura andina',
  'Desarrollo de sistemas de información para la gestión municipal',
  'Evaluación de la calidad educativa en zonas urbano-marginales',
  'Modelos de gestión del talento humano en el sector público',
  'Análisis de la satisfacción del cliente en el sector retail',
  'Impacto de las redes sociales en el comportamiento del consumidor',
  'Gestión ambiental en la industria minera',
  'Innovación tecnológica en el sector agroindustrial',
  'Prevención de riesgos psicosociales en el trabajo remoto',
  'Turismo sostenible en comunidades altoandinas',
  'Automatización de procesos administrativos con software libre'
];

const DEPARTAMENTOS = [
  { department: 'Lima', province: 'Lima' },
  { department: 'Arequipa', province: 'Arequipa' },
  { department: 'Cusco', province: 'Cusco' },
  { department: 'La Libertad', province: 'Trujillo' },
  { department: 'Piura', province: 'Piura' },
  { department: 'Lambayeque', province: 'Chiclayo' },
  { department: 'Junín', province: 'Huancayo' },
  { department: 'Ica', province: 'Ica' },
  { department: 'Tacna', province: 'Tacna' },
  { department: 'Puno', province: 'Puno' }
];

const FUENTES = ['Chatbot Web', 'Referido', 'Facebook Ads', 'Google Ads', 'WhatsApp', 'Manual'];
const ASESORES = ['Kevin', 'Andrea', 'Diego', 'Milagros'];

function pick(arr, seedIndex) {
  return arr[seedIndex % arr.length];
}

function buildViability(columnKey, index) {
  // Distribución de viabilidad coherente con la etapa del funnel.
  let base;
  if (columnKey === 'ganado') base = 85 + (index % 13); // 85-97
  else if (columnKey === 'en_negociacion') base = 72 + (index % 13); // 72-84
  else if (columnKey === 'contactado') base = 60 + (index % 20); // 60-79
  else if (columnKey === 'perdido') base = 30 + (index % 25); // 30-54
  else base = 45 + (index % 40); // nuevo: 45-84

  let level = 'Alta';
  if (base < 60) level = 'Baja';
  else if (base < 75) level = 'Media';
  else if (base < 85) level = 'Media-Alta';

  return { score: base, level };
}

function buildPhone(index) {
  const suffix = String(900000000 + ((index * 137 + 41) % 99999999)).slice(0, 9);
  return '9' + suffix.slice(1);
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function buildLeadsForColumn(columnKey, offset) {
  const leads = [];
  for (let i = 0; i < LEADS_PER_COLUMN; i++) {
    const seedIndex = offset + i;
    const nombre = pick(NOMBRES, seedIndex);
    const apellido = pick(APELLIDOS, seedIndex * 3 + 1);
    const apellido2 = pick(APELLIDOS, seedIndex * 5 + 2);
    const fullName = `${nombre} ${apellido} ${apellido2}`;
    const fieldOfStudy = pick(CARRERAS, seedIndex * 7 + 3);
    const academicLevel = pick(NIVELES_ACADEMICOS, seedIndex);
    const topic = pick(TEMAS_TESIS, seedIndex * 11 + 4);
    const university = pick(UNIVERSIDADES, seedIndex * 13 + 5);
    const location = pick(DEPARTAMENTOS, seedIndex * 17 + 6);
    const { score, level } = buildViability(columnKey, seedIndex);
    const daysAgo = Math.floor(Math.random() * 75);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    leads.push({
      topic,
      academic_level: academicLevel,
      field_of_study: fieldOfStudy,
      email: `${normalize(nombre)}.${normalize(apellido)}${seedIndex}@example.com`,
      phone: buildPhone(seedIndex),
      additional_notes: 'Lead de prueba generado automáticamente para poblar el funnel.',
      overall_viability_score: score,
      viability_level: level,
      full_name: fullName,
      dni: String(70000000 + seedIndex * 37),
      gender: seedIndex % 2 === 0 ? 'Femenino' : 'Masculino',
      birth_date: `19${90 + (seedIndex % 10)}-0${(seedIndex % 9) + 1}-15`,
      university,
      thesis_situation: pick(['Tema definido', 'Sin tema aún', 'Proyecto aprobado', 'En redacción'], seedIndex),
      department: location.department,
      province: location.province,
      address: `Av. Los Próceres ${100 + seedIndex}, ${location.province}`,
      assigned_to: pick(ASESORES, seedIndex),
      source: pick(FUENTES, seedIndex * 3),
      status: columnKey,
      created_at: createdAt
    });
  }
  return leads;
}

export async function seed(knex) {
  // --- Columnas del funnel ---
  await knex('funnel_columns').del();
  await knex('funnel_columns').insert(DEFAULT_COLUMNS);

  // --- Leads de prueba (elimina en cascada proyectos/cotizaciones asociados) ---
  await knex('leads').del();

  let offset = 0;
  for (const column of DEFAULT_COLUMNS) {
    const leads = buildLeadsForColumn(column.key, offset);
    await knex('leads').insert(leads);
    offset += LEADS_PER_COLUMN;
  }
}
