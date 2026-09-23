/**
 * Entregables que se ofrecen en la cotización de tesis.
 *
 * Es el bloque "Descripción del servicio y entregables incluidos" del
 * documento que el equipo ya usaba en papel: hasta ahora se tipeaba a mano en
 * un textarea cada vez, con el riesgo de que a una cotización le faltara una
 * línea o dijera algo distinto que a la anterior. Acá está el catálogo, y en
 * el formulario cada uno es un check que se marca o se desmarca.
 *
 * `label` va en negrita en el documento y `description` a continuación, que es
 * exactamente cómo se imprime: "Reporte TURNITIN: Certificado oficial de…".
 */
export const QUOTE_DELIVERABLES = [
  {
    key: 'propuestas',
    label: '03 Propuestas de tema',
    description: 'Acorde a las líneas de investigación de tu universidad.'
  },
  {
    key: 'plan',
    label: 'Plan de Tesis / Proyecto',
    description: 'Elaboración integral del anteproyecto con rigor metodológico.'
  },
  {
    key: 'informe',
    label: 'Informe Final / Tesis Completa',
    description: 'Desarrollo completo de capítulos, análisis de datos y resultados.'
  },
  {
    key: 'observaciones',
    label: 'Levantamiento de Observaciones',
    description: 'Corrección ilimitada de observaciones formuladas por el asesor y jurados.'
  },
  {
    key: 'turnitin',
    label: 'Reporte TURNITIN',
    description: 'Certificado oficial de verificación de antiplagio y bajo % de similitud.'
  },
  {
    key: 'diapositivas',
    label: 'Diapositivas Profesionales',
    description: 'Diseño de plantilla de alta calidad para la exposición final.'
  },
  {
    key: 'balotario',
    label: 'Balotario de Preguntas',
    description: 'Cuestionario de posibles preguntas del jurado.'
  },
  {
    key: 'asesoria',
    label: 'Asesoría Extraordinaria',
    description: 'Orientación personalizada continua en cada etapa del desarrollo.'
  },
  {
    key: 'simulacion',
    label: 'Simulación de Sustentación',
    description: 'Ensayo previo en vivo con simulación de jurado evaluador.'
  }
];

/** Título y bajada del servicio con los que sale una cotización nueva. */
export const QUOTE_SERVICE_DEFAULTS = {
  conceptTitle: 'DESARROLLO DE TESIS COMPLETA - SERVICIO INTEGRAL',
  serviceSubtitle: 'Acompañamiento, tutoría y correcciones continuas hasta la aprobación formal.',
  estimatedTime: '1 mes',
  statusLabel: 'Aprobada para gestión',
  warrantyText: 'El servicio asegura acompañamiento constante y revisiones adaptadas a las exigencias y rúbricas de la universidad hasta la aprobación formal de la tesis.',
  commercialTerms: [
    'Los entregables y avances se programarán según el cronograma acordado en el contrato de servicio.',
    'Esta cotización formaliza el alcance de la tesis terminada con las herramientas mencionadas, sin costos adicionales.',
    'Validez de la propuesta económica sujeta a confirmación antes de la fecha de vigencia indicada.'
  ].join('\n')
};

/** Una línea "Etiqueta: descripción" por entregable, como la lee el documento. */
export function deliverableLine(item) {
  return item.description ? `${item.label}: ${item.description}` : item.label;
}
