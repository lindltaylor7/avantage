/**
 * Catálogo de carreras del sistema universitario peruano, agrupadas por área.
 *
 * Antes cada pantalla repetía su propia lista de ocho "áreas" muy amplias
 * ("Ciencias de la Salud y Medicina", "Educación y Psicología", ...), que servía
 * para clasificar pero no para nombrar lo que el cliente realmente estudia. Acá
 * viven las carreras concretas, y las pantallas las pintan con `<optgroup>`
 * para que la lista larga siga siendo navegable.
 *
 * Los grupos son solo encabezados: lo que se guarda en la base (y lo que ve el
 * cliente en su contrato) es el nombre de la carrera.
 */
export const CAREER_GROUPS = [
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

/** Todas las carreras en una sola lista (para datalists y búsquedas). */
export const CAREERS = CAREER_GROUPS.flatMap((group) => group.careers);

/** Carrera con la que arranca un formulario vacío. */
export const DEFAULT_CAREER = 'Ingeniería de Sistemas y Computación';

/**
 * Grupos a mostrar en un `<select>` que ya tiene un valor guardado.
 *
 * Los leads y proyectos anteriores a este catálogo guardaron las áreas amplias
 * ("Educación y Psicología", por ejemplo). Si ese valor no está en la lista, el
 * navegador dejaría el select en blanco y el primer guardado lo cambiaría sin
 * que nadie lo pidiera: por eso se agrega al final como su propio grupo.
 */
export function careerGroupsWith(value) {
  const current = String(value || '').trim();
  if (!current || CAREERS.includes(current)) return CAREER_GROUPS;
  return [...CAREER_GROUPS, { label: 'Registrado anteriormente', careers: [current] }];
}
