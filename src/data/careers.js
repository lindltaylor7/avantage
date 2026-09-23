/**
 * Catálogo de carreras que alimenta todos los desplegables de "Carrera".
 *
 * La lista **la administra el equipo** desde `/admin/carreras` y vive en la
 * base de datos (`career_groups` + `careers`); acá solo se la carga una vez por
 * sesión del navegador y se la deja en un `ref` para que cualquier pantalla que
 * la esté pintando se actualice cuando llegue.
 *
 * La lista de abajo es el **respaldo**: es la copia que se sembró en la base al
 * aplicar la migración y la que se usa mientras la petición está en vuelo (o si
 * falla, sin red). Así un formulario nunca aparece con el desplegable vacío.
 *
 * Los grupos son solo encabezados (`<optgroup>`): lo que se guarda en la base
 * —y lo que ve el cliente en su contrato— es el nombre de la carrera.
 */
import { computed, shallowRef } from 'vue';

export const FALLBACK_CAREER_GROUPS = [
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

/** Catálogo en uso: el respaldo hasta que responda `GET /api/careers`. */
const catalog = shallowRef(FALLBACK_CAREER_GROUPS);

/** Todas las carreras en una sola lista (para datalists y búsquedas). */
export const careerNames = computed(() => catalog.value.flatMap((group) => group.careers));

/** Carrera con la que arranca un formulario vacío. */
export const DEFAULT_CAREER = 'Ingeniería de Sistemas y Computación';

let pendingLoad = null;

/**
 * Trae el catálogo del backend. Se llama una vez al arrancar la app
 * (`main.js`) y de nuevo desde `/admin/carreras` cada vez que se edita, para
 * que el resto del panel vea el cambio sin recargar la página.
 *
 * El endpoint es público (el evaluador de tesis no pide sesión), así que va
 * con `fetch` pelado y no con `apiFetch`: un catálogo no debe arrastrar al
 * visitante al login si el token guardado está vencido.
 *
 * @param {{ force?: boolean }} options `force` ignora la carga ya hecha.
 */
export function loadCareerCatalog({ force = false } = {}) {
  if (force) pendingLoad = null;
  pendingLoad ??= fetch('/api/careers')
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const groups = (data?.groups || [])
        .map((group) => ({
          label: group.label,
          careers: (group.careers || []).map((career) => career.name).filter(Boolean)
        }))
        .filter((group) => group.careers.length > 0);
      // Un catálogo vacío (base recién creada, migración a medias) no debe
      // dejar los formularios sin opciones: se conserva el respaldo.
      if (groups.length > 0) catalog.value = groups;
    })
    .catch((error) => console.warn('No se pudo cargar el catálogo de carreras:', error));
  return pendingLoad;
}

/**
 * Grupos a mostrar en un `<select>` que ya tiene un valor guardado.
 *
 * Los leads y proyectos anteriores a este catálogo guardaron las áreas amplias
 * ("Educación y Psicología", por ejemplo), y una carrera que el equipo saque
 * del catálogo sigue escrita en las fichas que la usaron. Si ese valor no está
 * en la lista, el navegador dejaría el select en blanco y el primer guardado lo
 * cambiaría sin que nadie lo pidiera: por eso se agrega al final como su propio
 * grupo.
 */
export function careerGroupsWith(value) {
  const groups = catalog.value;
  const current = String(value || '').trim();
  if (!current || groups.some((group) => group.careers.includes(current))) return groups;
  return [...groups, { label: 'Registrado anteriormente', careers: [current] }];
}
