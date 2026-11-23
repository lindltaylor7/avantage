/**
 * ¿Por qué la etapa "Ganado" del Funnel de Ventas se ve vacía?
 *
 * Solo LEE. Contesta las cuatro cosas que no se pueden contestar mirando la
 * pantalla: qué columnas tiene el tablero y cuál está marcada como ganadora,
 * con qué `status` quedó cada venta cerrada, si conserva el sello
 * `sales_funnel_at` —de él dependen que el tablero del closer la dibuje y que
 * el bot no pueda volver a moverla— y quién la movió, según la bitácora.
 *
 * Hay dos formas de que una venta cerrada desaparezca de la etapa ganadora, y
 * se arreglan distinto:
 *
 *   1. La COLUMNA no coincide. El cierre escribe siempre `ganado` (el único
 *      valor que reconocen todas las lecturas del sistema) y la clave de una
 *      etapa creada desde la pantalla la genera el servidor
 *      (`col_mtc9ogeu_kpk`). El tablero las junta desde el 23/11/2026.
 *   2. El LEAD ya no dice `ganado`: lo devolvieron a una etapa del Setter
 *      Funnel, con lo que se le borró el sello, y desde ahí el bot pudo
 *      seguir moviéndolo. El proyecto sigue abierto, pero el lead no se
 *      dibuja en el Funnel de Ventas.
 *
 *   node backend/scripts/diagnosticarEtapaGanadora.js
 */
import { db } from '../db/connection.js';
import { loadWinningStatuses, SETTER_ONLY_STATUSES } from '../services/salesFunnelStage.js';

/** Las fechas se imprimen enteras: la pregunta es cuándo pasó y en qué orden. */
function isoFecha(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').slice(0, 19);
}

async function main() {
  const columns = await db('funnel_columns').select('*').orderBy('position');
  const winning = await loadWinningStatuses();
  const finalColumn = columns.find((column) => column.final) || null;

  console.log('=== Columnas del Funnel de Ventas ===');
  if (columns.length === 0) {
    console.log('(ninguna: el tablero está sin configurar)');
  }
  for (const column of columns) {
    const marca = column.final ? '  ETAPA GANADORA' : '';
    console.log(`  ${column.position}. ${column.label}   clave=${column.key}${marca}`);
  }

  if (!finalColumn) {
    console.log('\nNinguna columna está marcada como ganadora.');
    console.log('    Sin esa marca, cerrar una venta no mueve el lead a ninguna etapa del tablero');
    console.log('    y "venta ganada" queda reducida al estado fijo `ganado`.');
  } else if (finalColumn.key !== 'ganado') {
    console.log(`\nLa etapa ganadora se llama "${finalColumn.label}" pero su clave es "${finalColumn.key}".`);
    console.log('    Es lo normal cuando la columna se creó desde la pantalla: la clave la genera');
    console.log('    el servidor. El cierre de venta sigue escribiendo `ganado`, así que los dos');
    console.log('    valores significan lo mismo y el tablero los junta en esta columna.');
  }

  console.log('\n=== Estados que hoy significan "venta ganada" ===');
  console.log(`  ${[...winning].join(', ')}`);

  const closed = await db('leads')
    .leftJoin('projects', 'projects.lead_id', 'leads.id')
    .whereIn('leads.status', [...winning])
    .orWhereNotNull('projects.id')
    .select(
      'leads.id',
      'leads.full_name',
      'leads.status',
      'leads.assigned_to',
      'leads.assigned_user_id',
      'leads.sales_funnel_at',
      'projects.id as project_id'
    )
    .orderBy('leads.id');

  /*
   * La bitácora de TODOS a la vez y no una consulta por lead: son los
   * movimientos de unas pocas decenas de fichas y la pregunta se hace de
   * corrido, igual que `listForLeads()` en el Reporte de Leads.
   */
  const historia = new Map();
  if (closed.length > 0) {
    const rows = await db('lead_stage_changes')
      .whereIn('lead_id', closed.map((lead) => lead.id))
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .select('*');
    for (const row of rows) {
      if (!historia.has(row.lead_id)) historia.set(row.lead_id, []);
      historia.get(row.lead_id).push(row);
    }
  }

  console.log(`\n=== Leads ganados (o con proyecto abierto): ${closed.length} ===`);
  const columnKeys = new Set(columns.map((column) => column.key));
  let fueraDeLaEtapa = 0;
  let sinResponsable = 0;
  let invisibles = 0;

  for (const lead of closed) {
    /*
     * El sello `sales_funnel_at` decide dos cosas a la vez: si el tablero del
     * closer dibuja al lead y si el bot puede volver a moverlo. Sin él, una
     * etapa del setter lo saca del Funnel de Ventas y se lo devuelve al bot,
     * que es la forma en que una venta cerrada deja de verse sin que nada
     * falle a la vista. Por eso va junto al estado y no en una línea aparte.
     */
    const escondido = !lead.sales_funnel_at && SETTER_ONLY_STATUSES.includes(lead.status);
    if (escondido) invisibles += 1;
    if (!lead.assigned_user_id) sinResponsable += 1;

    // La misma regla que el tablero: la clave exacta manda, y una venta ganada
    // sin columna propia va a la etapa ganadora.
    let ubicacion;
    if (escondido) {
      ubicacion = 'EN NINGUNA - no se dibuja en el Funnel de Ventas';
    } else if (columnKeys.has(lead.status)) {
      ubicacion = columns.find((column) => column.key === lead.status).label;
    } else if (finalColumn && (winning.has(lead.status) || lead.project_id)) {
      // El MISMO criterio que `filteredLeadsByColumn` en `LeadsView.vue`: el
      // estado `ganado` o el proyecto abierto. Si acá dijera otra cosa, el
      // diagnóstico mandaría a arreglar lo que el tablero ya muestra bien.
      const porque = winning.has(lead.status) ? 'por su etapa' : 'por su proyecto abierto';
      ubicacion = `${finalColumn.label} (${porque})`;
    } else {
      ubicacion = `${columns[0]?.label || '—'}  (no coincide con ninguna columna)`;
      fueraDeLaEtapa += 1;
    }

    const sello = lead.sales_funnel_at
      ? `sí (${isoFecha(lead.sales_funnel_at)})`
      : 'NO - fuera del Funnel de Ventas y a merced del bot';

    console.log(
      `  #${lead.id} ${lead.full_name || '(sin nombre)'}` +
      `\n      status=${lead.status}   proyecto=${lead.project_id || '—'}` +
      `\n      responsable=${lead.assigned_to || 'SIN ASIGNAR'}` +
      `\n      sello sales_funnel_at: ${sello}` +
      `\n      el tablero lo muestra en: ${ubicacion}`
    );

    const trail = historia.get(lead.id) || [];
    if (trail.length === 0) {
      console.log('      bitácora: sin movimientos registrados (son anteriores a `lead_stage_changes`)');
    } else {
      console.log('      bitácora:');
      for (const row of trail) {
        const quien = row.actor_name || row.actor_type || 'desconocido';
        const marca = row.blocked ? '   BLOQUEADO' : '';
        console.log(
          `        ${isoFecha(row.created_at)}  ${row.from_status || '—'} -> ${row.to_status}` +
          `  por ${quien} (${row.actor_type})${marca}`
        );
      }
    }
  }

  if (fueraDeLaEtapa > 0) {
    console.log(`\n${fueraDeLaEtapa} lead(s) ganados caen fuera de la etapa ganadora.`);
  }
  if (invisibles > 0) {
    console.log(
      `\n${invisibles} lead(s) con proyecto abierto NO se dibujan en el Funnel de Ventas:` +
      '\n    quedaron con una etapa del Setter Funnel y sin el sello `sales_funnel_at`, que es' +
      '\n    justo la combinación que los devuelve al tablero del setter y deja que el bot los' +
      '\n    siga moviendo. La bitácora de arriba dice quién los sacó de la etapa ganadora.'
    );
  }
  if (sinResponsable > 0) {
    console.log(
      `\n${sinResponsable} lead(s) ganados no tienen responsable comercial asignado.` +
      '\n    Un lead sin responsable no lo ve NADIE salvo quien reparte (`leads.manage_all`),' +
      '\n    así que para el resto del equipo el tablero se ve vacío aunque el lead exista.'
    );
  }
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
