/**
 * Devuelve el sello `sales_funnel_at` a las ventas cerradas que lo perdieron.
 *
 * `updateLeadStatus()` borraba el sello cuando una persona devolvía un lead a
 * una etapa del Setter Funnel. Para un lead que de verdad vuelve a calificarse
 * es lo correcto; para una venta ya cerrada abría esta cadena: sin sello y con
 * una etapa del setter, `leadHasGraduated()` decía que no, así que el bot
 * volvía a tratarlo como un contacto por calificar y lo seguía moviendo
 * (`conversacion_abierta`, `calificando`, `congelado`, `descartado`). El lead
 * salía del Funnel de Ventas, reaparecía en el tablero del setter y la etapa
 * ganadora quedaba en 0 mientras Finanzas, Proyectos y Campañas lo seguían
 * contando como venta: 19 proyectos abiertos así (reporte del 23/11/2026).
 *
 * El tope nuevo vive en `leadService.updateLeadStatus()`, pero solo evita el
 * daño futuro — el sello de los que ya lo perdieron no vuelve solo, y sin él
 * esos leads se siguen viendo en los DOS tableros.
 *
 * No se inventa una fecha: se usa la del proyecto, que es el instante en que
 * la venta se cerró. Y NO se toca `leads.status`: dónde va la tarjeta es una
 * decisión del equipo comercial, y el tablero ya ubica una venta cerrada en la
 * etapa ganadora por su proyecto abierto. Reescribir la etapa de 19 fichas
 * desde una migración sería decidir eso por ellos y además borrar la historia
 * de por dónde pasó cada lead.
 *
 * Es un UPDATE y no un DDL, así que se puede reintentar tal cual: el `where`
 * deja de encontrar las filas que ya se corrigieron.
 */
export async function up(knex) {
  if (!(await knex.schema.hasTable('leads'))) return;
  if (!(await knex.schema.hasTable('projects'))) return;
  if (!(await knex.schema.hasColumn('leads', 'sales_funnel_at'))) return;

  const pendientes = await knex('leads')
    .join('projects', 'projects.lead_id', 'leads.id')
    .whereNull('leads.sales_funnel_at')
    .select('leads.id as lead_id', 'projects.created_at as closed_at');

  for (const fila of pendientes) {
    await knex('leads')
      .where({ id: fila.lead_id })
      .whereNull('sales_funnel_at')
      .update({ sales_funnel_at: fila.closed_at || knex.fn.now() });
  }

  if (pendientes.length > 0) {
    console.log(`✅ [Migración] ${pendientes.length} venta(s) cerrada(s) recuperaron su sello del Funnel de Ventas.`);
  }
}

/**
 * El `down()` no deshace nada a propósito, y no es una omisión.
 *
 * Volver a poner esos sellos en NULL es exactamente el estado roto que esta
 * migración vino a arreglar: devolvería las ventas cerradas al tablero del
 * setter y se las volvería a entregar al bot. Además no hay cómo distinguir
 * los sellos que escribió esta migración de los que el lead ya tenía, así que
 * un `down()` "simétrico" borraría también los buenos.
 */
export async function down() {
  // Intencionalmente vacío: ver el comentario de arriba.
}
