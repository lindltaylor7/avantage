/**
 * ¿Por qué la etapa "Ganado" del Funnel de Ventas se ve vacía?
 *
 * Solo LEE. Contesta las tres cosas que no se pueden contestar mirando la
 * pantalla: qué columnas tiene el tablero y cuál está marcada como ganadora,
 * con qué `status` quedaron los leads cerrados, y en qué columna los ubica hoy
 * el tablero.
 *
 * La causa conocida: el cierre de venta escribe siempre `ganado` —el único
 * valor que reconocen todas las lecturas del sistema (`loadWinningStatuses()`,
 * del que cuelgan Finanzas, Campañas y la comisión de la setter)—, pero el
 * tablero ubicaba cada lead comparando su status contra la CLAVE de la
 * columna, y la de una etapa creada desde la pantalla la genera el servidor
 * (`col_mtc2nwec_fij`). Recrear la columna "Ganado" bastaba para que dejara de
 * recibir sus propios leads: caían en la primera columna del tablero mientras
 * Proyectos y Finanzas los seguían contando como ganados.
 *
 *   node backend/scripts/diagnosticarEtapaGanadora.js
 */
import { db } from '../db/connection.js';
import { loadWinningStatuses } from '../services/salesFunnelStage.js';

async function main() {
  const columns = await db('funnel_columns').select('*').orderBy('position');
  const winning = await loadWinningStatuses();
  const finalColumn = columns.find((column) => column.final) || null;

  console.log('=== Columnas del Funnel de Ventas ===');
  if (columns.length === 0) {
    console.log('(ninguna: el tablero está sin configurar)');
  }
  for (const column of columns) {
    const marca = column.final ? '  🏆 ETAPA GANADORA' : '';
    console.log(`  ${column.position}. ${column.label}   clave=${column.key}${marca}`);
  }

  if (!finalColumn) {
    console.log('\n⚠️  Ninguna columna está marcada como ganadora.');
    console.log('    Sin esa marca, cerrar una venta no mueve el lead a ninguna etapa del tablero');
    console.log('    y "venta ganada" queda reducida al estado fijo `ganado`.');
  } else if (finalColumn.key !== 'ganado') {
    console.log(`\nℹ️  La etapa ganadora se llama "${finalColumn.label}" pero su clave es "${finalColumn.key}".`);
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

  console.log(`\n=== Leads ganados (o con proyecto abierto): ${closed.length} ===`);
  const columnKeys = new Set(columns.map((column) => column.key));
  let fueraDeLaEtapa = 0;
  let sinResponsable = 0;

  for (const lead of closed) {
    // La misma regla que el tablero: la clave exacta manda, y una venta ganada
    // sin columna propia va a la etapa ganadora.
    let ubicacion;
    if (columnKeys.has(lead.status)) {
      ubicacion = columns.find((column) => column.key === lead.status).label;
    } else if (finalColumn && winning.has(lead.status)) {
      ubicacion = `${finalColumn.label} (por ser venta ganada)`;
    } else {
      ubicacion = `${columns[0]?.label || '—'} ⚠️  (no coincide con ninguna columna)`;
      fueraDeLaEtapa += 1;
    }

    if (!lead.assigned_user_id) sinResponsable += 1;

    console.log(
      `  #${lead.id} ${lead.full_name || '(sin nombre)'}` +
      `\n      status=${lead.status}   proyecto=${lead.project_id || '—'}` +
      `\n      responsable=${lead.assigned_to || 'SIN ASIGNAR'}${lead.assigned_user_id ? '' : ' ⚠️'}` +
      `\n      el tablero lo muestra en: ${ubicacion}`
    );
  }

  if (fueraDeLaEtapa > 0) {
    console.log(`\n⚠️  ${fueraDeLaEtapa} lead(s) ganados caen fuera de la etapa ganadora.`);
  }
  if (sinResponsable > 0) {
    console.log(
      `\n⚠️  ${sinResponsable} lead(s) ganados no tienen responsable comercial asignado.` +
      '\n    Un lead sin responsable no lo ve NADIE salvo quien reparte (`leads.manage_all`),' +
      '\n    así que para el resto del equipo el tablero se ve vacío aunque el lead exista.'
    );
  }
}

main()
  .catch((error) => {
    console.error('❌', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
