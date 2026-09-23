/**
 * Limpia la carrera que llega en texto libre (formulario de Meta, mensaje del
 * lead) antes de guardarla y, sobre todo, antes de devolvérsela escrita.
 *
 * El bot repite la carrera en su primer mensaje ("Perfecto: ing mecanica
 * electrica") porque es el único momento en que el lead puede corregirnos si
 * entendimos mal. Con el texto crudo del formulario —sin tildes, en
 * minúsculas y abreviado— ese mensaje se lee descuidado justo en el primer
 * contacto, y ese mismo texto termina después en la cotización y en el
 * contrato.
 *
 * No se mapea contra un catálogo cerrado a propósito: la gama de carreras
 * peruanas es enorme y forzar "ing mecanica electrica" a la entrada más
 * parecida de una lista corre el riesgo de cambiarle la carrera a alguien.
 * Acá solo se arregla la ESCRITURA (tildes, abreviaturas, mayúsculas) y se
 * respeta lo que el lead escribió.
 */

/** Abreviaturas que la gente escribe en el formulario, ya en minúsculas. */
const ABBREVIATIONS = {
  ing: 'ingeniería',
  ingº: 'ingeniería',
  'ing.': 'ingeniería',
  inge: 'ingeniería',
  adm: 'administración',
  'adm.': 'administración',
  admin: 'administración',
  lic: 'licenciatura',
  'lic.': 'licenciatura',
  cont: 'contabilidad',
  psico: 'psicología',
  arq: 'arquitectura',
  'arq.': 'arquitectura',
  edu: 'educación',
  vet: 'veterinaria',
  tec: 'técnica',
  ind: 'industrial',
  sist: 'sistemas',
  'sist.': 'sistemas'
};

/**
 * Palabras que la gente escribe sin tilde. Solo las que aparecen en nombres
 * de carrera: fuera de ese contexto no se toca nada.
 */
const ACCENTS = {
  ingenieria: 'ingeniería',
  educacion: 'educación',
  administracion: 'administración',
  comunicacion: 'comunicación',
  comunicaciones: 'comunicaciones',
  computacion: 'computación',
  informatica: 'informática',
  mecanica: 'mecánica',
  electrica: 'eléctrica',
  electronica: 'electrónica',
  mecatronica: 'mecatrónica',
  metalurgica: 'metalúrgica',
  quimica: 'química',
  fisica: 'física',
  matematica: 'matemática',
  matematicas: 'matemáticas',
  estadistica: 'estadística',
  biologia: 'biología',
  geologia: 'geología',
  psicologia: 'psicología',
  sociologia: 'sociología',
  antropologia: 'antropología',
  odontologia: 'odontología',
  tecnologia: 'tecnología',
  agronomia: 'agronomía',
  economia: 'economía',
  filosofia: 'filosofía',
  pedagogia: 'pedagogía',
  enfermeria: 'enfermería',
  veterinaria: 'veterinaria',
  nutricion: 'nutrición',
  gestion: 'gestión',
  produccion: 'producción',
  traduccion: 'traducción',
  linguistica: 'lingüística',
  publica: 'pública',
  publicas: 'públicas',
  politica: 'política',
  politicas: 'políticas',
  agricola: 'agrícola',
  farmaceutica: 'farmacéutica',
  biomedica: 'biomédica',
  clinica: 'clínica',
  grafico: 'gráfico',
  grafica: 'gráfica',
  logistica: 'logística',
  telecomunicacion: 'telecomunicación',
  telecomunicaciones: 'telecomunicaciones'
};

/** Van en minúscula salvo que abran el nombre. */
const CONNECTORS = new Set(['de', 'del', 'el', 'la', 'las', 'los', 'y', 'e', 'en', 'para', 'con', 'a', 'al']);

/** Siglas que se escriben en mayúsculas aunque estén en medio del nombre. */
const ACRONYMS = new Set(['tsp', 'tic', 'tics', 'ia', 'ti']);

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * @param {string} rawText Carrera tal como la escribió el lead.
 * @returns {string} La misma carrera, legible. Devuelve '' si no hay texto.
 */
export function normalizeCareer(rawText) {
  const clean = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  // Si ya viene escrita con mayúsculas y tildes (la eligió de un select del
  // panel, por ejemplo), no hay nada que arreglar.
  const alreadyFormatted = /[A-ZÁÉÍÓÚÑ]/.test(clean) && /[áéíóúñü]/.test(clean);
  if (alreadyFormatted) return clean;

  const words = clean.toLowerCase().split(' ');
  return words
    .map((word, index) => {
      const bare = word.replace(/[.,;:]$/, '');
      // El punto de una abreviatura se va con ella: "ing." es "ingeniería",
      // no "ingeniería.".
      const expanded = ABBREVIATIONS[word] || ABBREVIATIONS[bare] || ACCENTS[bare] || bare;
      const punctuation = expanded === bare ? word.slice(bare.length) : '';

      if (ACRONYMS.has(expanded)) return expanded.toUpperCase() + punctuation;
      if (index > 0 && CONNECTORS.has(expanded)) return expanded + punctuation;
      return capitalize(expanded) + punctuation;
    })
    .join(' ');
}
