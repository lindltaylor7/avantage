/**
 * Catálogo cerrado de universidades peruanas (sigla/alias -> nombre oficial).
 * Es la fuente de verdad que `universityNormalizer.js` consulta ANTES de
 * confiar en cualquier respuesta del LLM: siglas parecidas ("UNAC" vs
 * "UNCP") o nombres cortos ambiguos ("Villarreal") se resuelven acá de forma
 * determinística, sin depender de que el modelo "adivine bien" cada vez.
 *
 * Cada alias se compara ya normalizado (minúsculas, sin tildes) contra el
 * texto del contacto — ver `normalizeToken()` en `universityNormalizer.js`.
 */
export const PERU_UNIVERSITIES = [
  { name: 'Universidad Nacional Mayor de San Marcos', aliases: ['unmsm', 'san marcos', 'sanmarcos'] },
  { name: 'Universidad Nacional de Ingeniería', aliases: ['uni'] },
  { name: 'Universidad Nacional del Callao', aliases: ['unac', 'callao'] },
  { name: 'Universidad Nacional Federico Villarreal', aliases: ['unfv', 'villarreal', 'federico villarreal'] },
  { name: 'Universidad Nacional del Centro del Perú', aliases: ['uncp', 'centro del peru'] },
  { name: 'Universidad César Vallejo', aliases: ['ucv', 'cesar vallejo'] },
  { name: 'Universidad Tecnológica del Perú', aliases: ['utp'] },
  { name: 'Universidad de San Martín de Porres', aliases: ['usmp', 'san martin de porres'] },
  { name: 'Universidad Nacional de San Antonio Abad del Cusco', aliases: ['unsaac', 'san antonio abad'] },
  { name: 'Universidad Peruana de Ciencias Aplicadas', aliases: ['upc'] },
  { name: 'Pontificia Universidad Católica del Perú', aliases: ['pucp', 'catolica'] },
  { name: 'Universidad Nacional Tecnológica de Lima Sur', aliases: ['untels'] },
  { name: 'Universidad de Ciencias y Humanidades', aliases: ['uch'] },
  { name: 'Universidad Continental', aliases: ['continental', 'la continental'] },
  { name: 'Universidad Peruana Los Andes', aliases: ['upla'] },
  { name: 'Universidad Nacional Daniel Alcides Carrión', aliases: ['undac'] },
  { name: 'Universidad Nacional de San Agustín', aliases: ['unsa', 'san agustin'] },
  { name: 'Universidad de Lima', aliases: ['ulima'] },
  { name: 'Universidad San Ignacio de Loyola', aliases: ['usil'] },
  { name: 'Universidad Privada del Norte', aliases: ['upn'] },
  { name: 'Universidad Andina del Cusco', aliases: ['uandina', 'andina del cusco'] },
  { name: 'Universidad Nacional de Trujillo', aliases: ['unt', 'universidad nacional de trujillo'] },
  { name: 'Universidad Ricardo Palma', aliases: ['urp', 'ricardo palma'] },
  { name: 'Universidad ESAN', aliases: ['esan'] }
];
