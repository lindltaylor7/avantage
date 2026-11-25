import { db } from '../db/connection.js';
import { INCOME_CLASSES, classifyIncomeRow, firstInstallmentIds } from '../services/incomeSplit.js';

/**
 * ¿Qué parte de la caja la produjo vender y qué parte cobrar?
 *
 * Solo LEE. Es el reporte de porcentajes del Reporte General impreso en la
 * terminal, y existe para lo que la pantalla no puede hacer: **comprobar la
 * regla contra los datos**. La clase de cada cuota se deriva de su lugar en el
 * cronograma del lead y no se lee de `finance_income.is_initial_payment`
 * —ese marcador solo está puesto en los cierres posteriores al flujo que lo
 * creó—, así que la pregunta que hay que poder contestar antes de confiar en
 * los porcentajes es si lo derivado y el marcador dicen lo mismo donde los dos
 * existen. Eso no se contesta leyendo el código.
 *
 * Lo que hay que mirar al correrlo:
 *
 *  - **Desacuerdos: 0** → la regla derivada coincide con el marcador en todos
 *    los cierres que lo tienen, y los porcentajes se pueden usar.
 *  - **Algún desacuerdo** → o el cronograma de ese lead se reordenó sin
 *    resincronizar el marcador (ver `#syncInitialPayment()`), o el orden de
 *    `compareSchedule()` dejó de ser el de Finanzas. Las dos se arreglan en el
 *    lead que sale impreso; no se "arregla" cambiando el porcentaje.
 *  - **Mucho en «Sin cliente asignado»** → hay cuotas verificadas sin
 *    `lead_id`, que no se pueden atribuir a ninguna de las dos áreas. No es un
 *    fallo del reporte: es plata cuya procedencia no está registrada, y
 *    repartirla por descarte inventaría el porcentaje.
 *  - **Primer pago cerca del 100%** → o es una operación nueva sin cartera, o
 *    las cuotas siguientes no se están verificando en Finanzas. Lo segundo se
 *    ve en el conteo de cuotas, no en el monto.
 *
 * Uso:
 *   node backend/scripts/diagnosticarIngresosPorArea.js [meses]   (6 por defecto)
 */

const meses = Math.min(Math.max(Number(process.argv[2]) || 6, 1), 24);
const desde = new Date();
desde.setMonth(desde.getMonth() - (meses - 1));
desde.setDate(1);
const desdeDia = desde.toISOString().slice(0, 10);

const dinero = (valor) => `S/ ${(Number(valor) || 0).toFixed(2)}`;
const pct = (parte, total) => (total ? `${((parte / total) * 100).toFixed(1)}%` : '—');

// El cronograma COMPLETO, no solo la ventana: cuál es la primera cuota de un
// lead no se puede decidir con el plan recortado.
const todas = await db('finance_income')
  .select('id', 'lead_id', 'monto', 'estado', 'fecha', 'due_date', 'is_initial_payment', 'code');
const firstIds = firstInstallmentIds(todas);

console.log(`\n📊 Ingresos verificados de los últimos ${meses} mes(es), desde ${desdeDia}\n`);

const verificadas = todas.filter((row) => {
  if (row.estado !== 'verificado') return false;
  const dia = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha || '').slice(0, 10);
  return dia >= desdeDia;
});

const acumulado = Object.fromEntries(
  INCOME_CLASSES.map((clase) => [clase.key, { monto: 0, cuotas: 0, leads: new Set() }])
);
for (const row of verificadas) {
  const clase = classifyIncomeRow(row, firstIds);
  acumulado[clase].monto += Number(row.monto) || 0;
  acumulado[clase].cuotas += 1;
  if (row.lead_id) acumulado[clase].leads.add(row.lead_id);
}
const total = INCOME_CLASSES.reduce((suma, clase) => suma + acumulado[clase.key].monto, 0);

for (const clase of INCOME_CLASSES) {
  const fila = acumulado[clase.key];
  console.log(`  ${clase.label} (${clase.owner})`);
  console.log(`     ${pct(fila.monto, total).padStart(6)}  ${dinero(fila.monto).padStart(14)}  `
    + `${fila.cuotas} cuota(s), ${fila.leads.size} cliente(s)`);
}
console.log(`  ${'—'.repeat(40)}`);
console.log(`     Total de cuotas de clientes: ${dinero(total)} en ${verificadas.length} cuota(s)\n`);

// --- La comprobación que justifica el script ---
const leadsConMarcador = new Set(todas.filter((row) => row.is_initial_payment).map((row) => row.lead_id));
const desacuerdos = todas.filter((row) => (
  row.lead_id
  && leadsConMarcador.has(row.lead_id)
  && firstIds.has(row.id) !== Boolean(row.is_initial_payment)
));

console.log(`🔎 Cierres con marcador \`is_initial_payment\`: ${leadsConMarcador.size}`);
if (desacuerdos.length === 0) {
  console.log('   Desacuerdos entre lo derivado y el marcador: 0 ✅\n');
} else {
  console.log(`   ⚠️  Desacuerdos: ${desacuerdos.length}\n`);
  for (const row of desacuerdos) {
    console.log(`   · lead #${row.lead_id} cuota ${row.code || row.id}: `
      + `derivada ${firstIds.has(row.id) ? 'PRIMERA' : 'posterior'}, `
      + `marcador dice ${row.is_initial_payment ? 'PRIMERA' : 'posterior'}`);
  }
  console.log('\n   El marcador es el que desbloquea el proyecto al verificarse, así que un');
  console.log('   desacuerdo es también un proyecto que puede estar trabado sin razón:');
  console.log('   revisar el cronograma de esos leads en Finanzas.\n');
}

const sinLead = verificadas.filter((row) => !row.lead_id).length;
if (sinLead > 0) {
  console.log(`ℹ️  ${sinLead} cuota(s) verificada(s) sin cliente asignado: no se atribuyen a`);
  console.log('   ninguna de las dos áreas, y por eso van en su propia clase.\n');
}

await db.destroy();
