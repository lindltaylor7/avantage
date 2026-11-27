/**
 * La BANDA de viabilidad de un lead: Alta, Media o Baja.
 *
 * Son dos columnas y no una, y conviene no confundirlas:
 * `leads.overall_viability_score` es el puntaje numérico que calcula el
 * evaluador y `leads.viability_level` es la banda, que es con lo que el equipo
 * filtra su tablero (los recuadros 🌟 Alta / ⚖️ Media / 🔻 Baja del Setter
 * Funnel). El reporte de Campañas publicaba solo el puntaje —y promediado por
 * anuncio—, así que la mejor señal temprana de calidad de un anuncio no se
 * podía consultar por anuncio: 16 / 77 / 2 en el tablero y nada en la hoja
 * (revisión del 26/11/2026).
 *
 * La banda se guarda como **texto libre** (`string(50)`, la escribe el
 * evaluador y se puede corregir desde la ficha), así que acá se normaliza y no
 * se compara por igualdad: lo que llega es "Alta", "ALTA", "Viabilidad alta" o
 * "alta ✅" según por dónde haya entrado. Es la misma regla que ya aplica el
 * Setter Funnel con `lead.viability_level.includes('alta')`, movida a un módulo
 * para que el tablero y el reporte no puedan contar bandas distintas del mismo
 * lead.
 *
 * `null` es **"nadie la registró"** y no una cuarta banda: solo tienen banda
 * los leads que pasaron por el evaluador o por Avan, que son la minoría. Un
 * cero por defecto en "Baja" diría que el anuncio trae leads malos cuando lo
 * que pasa es que no se los evaluó — el mismo error con el signo cambiado que
 * cuando `leads.qualified` se derivaba de la etapa.
 */

/** Las tres bandas, en el orden en que se leen. */
export const VIABILITY_BANDS = ['alta', 'media', 'baja'];

/**
 * La banda de un lead, normalizada a `'alta' | 'media' | 'baja'`, o `null` si
 * no está registrada o dice algo que no es ninguna de las tres.
 *
 * El orden del recorrido no importa porque las tres palabras no se contienen
 * entre sí, pero sí importa que se busque por **contenido** y no por igualdad:
 * "Viabilidad alta" tiene que contar como alta.
 */
export function viabilityBand(level) {
  if (typeof level !== 'string') return null;
  const flat = level.trim().toLowerCase();
  if (!flat) return null;
  return VIABILITY_BANDS.find((band) => flat.includes(band)) || null;
}

/**
 * Cuenta las bandas de una lista de leads ya normalizados.
 *
 * Devuelve siempre las cuatro claves —las tres bandas y `sinRegistrar`—, y su
 * suma es siempre el total de la lista: es lo único que permite afirmar que
 * ningún lead se contó dos veces ni se quedó fuera, igual que los cajones de
 * `reconciliationBuckets`. `sinRegistrar` se publica y no se omite, porque un
 * anuncio con las tres bandas en cero puede traer leads sin evaluar o no
 * traer leads: son dos cosas distintas y se arreglan al revés.
 */
export function tallyViabilityBands(bands) {
  const out = { alta: 0, media: 0, baja: 0, sinRegistrar: 0 };
  for (const band of bands) {
    if (band === 'alta' || band === 'media' || band === 'baja') out[band] += 1;
    else out.sinRegistrar += 1;
  }
  return out;
}
