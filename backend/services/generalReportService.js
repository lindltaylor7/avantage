import { db } from '../db/connection.js';
import {
  LOST_STATUSES,
  isAppointmentStatus,
  isQuotationStatus,
  leadHasGraduated,
  loadQuotationStatuses,
  loadSalesFunnelStatuses,
  loadWinningStatuses
} from './salesFunnelStage.js';
import { LEAD_ORIGIN_COLUMNS, leadOrigin } from './leadOrigin.js';
import { buildTrace, groupByOrigin, reachedSteps } from './leadTraceability.js';
import { firstInstallmentIds, splitIncome } from './incomeSplit.js';
// La misma cuenta de "días sin que nadie lo toque" que publica el Reporte de
// Setters como cartera dormida. Importada y no copiada: las dos pantallas miran
// los mismos leads parados, y con una copia por reporte el mismo lead llevaría
// una cantidad de días distinta segun desde donde se lo mire.
import { daysBetween } from './setterReportService.js';
import {
  dayKeyOf,
  firstDayAfter,
  firstDayOf,
  lastMonthKeys,
  nextMonthKeys,
  normalizeMonths,
  percentChange,
  ratio,
  round2,
  toDayKey
} from './reportPeriod.js';

/**
 * Reporte General: la pantalla de gerencia. No es otro módulo de datos sino
 * las preguntas que se hacen para decidir, contestadas de una vez y sobre las
 * MISMAS fuentes que el resto del panel:
 *
 *  - ¿Cuánto vendimos y cuánto entró? Lo vendido es el precio pactado de los
 *    leads que se ganaron (un proyecto nace cuando se gana el lead, así que su
 *    `created_at` es el día del cierre). Lo cobrado y lo gastado NO se vuelven
 *    a sumar acá: salen de `financeLedgerService.getOverview()`, que es lo que
 *    muestra Finanzas. Dos pantallas con dos sumas propias es como se llega a
 *    que la gerencia vea un número y Finanzas otro.
 *  - ¿Qué nos deben y cuánto está vencido? Las cuotas `pendiente` por
 *    antigüedad de su fecha pactada (`due_date`). Las `pagado` van aparte:
 *    el cliente ya pagó y falta el visto bueno de Finanzas, no es deuda.
 *  - ¿De dónde salen las ventas? La trazabilidad y los canales se miden por
 *    COHORTE —los leads que entraron en el período y hasta dónde llegaron—,
 *    no contando ventas del mes contra leads del mes, que mezcla gente que
 *    entró en momentos distintos y da tasas mayores al 100%.
 *  - ¿En qué parte del proceso se quedan los leads? La cadena de
 *    `leadTraceability.js`, de marketing hasta la caja, con los parados y los
 *    perdidos de cada paso. Reemplazó al embudo de cuatro pasos que esta
 *    pantalla tenía: era la mitad acumulativa de la misma pregunta, y dos
 *    embudos sobre la misma cohorte terminan diciendo números distintos.
 *  - ¿La caja del mes la produjo vender o la produjo cobrar? El reparto de
 *    `incomeSplit.js`: el primer pago de cada cronograma es de Ventas y las
 *    cuotas siguientes las produce el área académica y la gestión del
 *    proyecto. Sin separarlas, un mes sostenido por una cartera vieja se lee
 *    igual que un mes que vendió bien.
 *
 * Una venta que no se concretó (`leads.deal_cancelled_at`) no cuenta como
 * vendida ni como cartera, igual que en Cobranzas; se informa aparte.
 *
 * Cada KPI se compara con el período anterior de la misma longitud: una cifra
 * sola no dice si las cosas van mejor o peor.
 */

const TOP_CHANNELS = 7;
const PROJECTION_MONTHS = 6;

/**
 * El tramo de antigüedad de una cuota pendiente según su fecha pactada.
 * `por_vencer` incluye la que vence hoy: todavía se puede pagar a tiempo.
 */
export const AGING_BUCKETS = [
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'd1_30', label: 'Vencido 1–30 días' },
  { key: 'd31_60', label: 'Vencido 31–60 días' },
  { key: 'd61_90', label: 'Vencido 61–90 días' },
  { key: 'd90', label: 'Vencido +90 días' }
];

export function agingBucket(dueDay, todayDay) {
  if (!dueDay || dueDay >= todayDay) return 'por_vencer';
  const dias = Math.round((Date.parse(`${todayDay}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86400000);
  if (dias <= 30) return 'd1_30';
  if (dias <= 60) return 'd31_60';
  if (dias <= 90) return 'd61_90';
  return 'd90';
}

/**
 * Las columnas de un lead de la cohorte.
 *
 * Las de atribución entran enteras (`LEAD_ORIGIN_COLUMNS`) porque de dónde
 * salió un lead lo contesta `leadOrigin()` y no un `where` propio: escrita acá,
 * esa regla sería una segunda versión de la de marketing y el día que se
 * separen esta pantalla diría una plataforma y el exportable de Campañas otra.
 */
const LEAD_COHORT_COLUMNS = [...new Set([
  'id', 'status', 'sales_funnel_at', 'total_amount', 'deal_cancelled_at',
  // La atención y la calificación: las dos anotaciones de la cadena.
  'first_response_at', 'qualified',
  ...LEAD_ORIGIN_COLUMNS
])];

/**
 * Agrupa por una clave, se queda con los `limit` más grandes y junta el resto
 * en "Otros": una barra por cada origen escrito a mano no se lee.
 */
export function topWithOther(rows, limit, sortKey) {
  const sorted = [...rows].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const other = { label: 'Otros', isOther: true };
  for (const row of rest) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number') other[key] = (other[key] || 0) + value;
    }
  }
  return [...head, other];
}

/** Suma, mes a mes, las series por cuenta que devuelve `getOverview()`. */
export function sumSeries(series, length) {
  const totals = new Array(length).fill(0);
  for (const s of series || []) {
    s.values.forEach((v, i) => { totals[i] += Number(v) || 0; });
  }
  return totals.map(round2);
}

const sumRange = (values, from, to) => round2(values.slice(from, to).reduce((a, b) => a + b, 0));

export class GeneralReportService {
  constructor({ financeLedgerService }) {
    this.financeLedgerService = financeLedgerService;
  }

  async report(query = {}, now = new Date()) {
    const months = normalizeMonths(query.months);
    // Se trae el doble de meses: la mitad vieja es el período de comparación.
    const allKeys = lastMonthKeys(months * 2, now);
    const keys = allKeys.slice(months);
    const prevKeys = allKeys.slice(0, months);
    const windowStart = firstDayOf(allKeys[0]);
    const currentStart = firstDayOf(keys[0]);
    const windowEnd = firstDayAfter(keys[keys.length - 1]);
    const today = dayKeyOf(now);
    const inCurrent = (monthKey) => monthKey >= keys[0];

    const [overview, wonStatuses, salesStatuses, quotationStatuses] = await Promise.all([
      this.financeLedgerService.getOverview({ monthsBack: months * 2 }),
      loadWinningStatuses(),
      // El vocabulario de `leads.status` se pregunta donde ya está contestado:
      // las columnas de los dos tableros las crea el equipo y sus claves se
      // generan solas (`col_mtc2nwec_fij`), así que no se pueden listar acá.
      loadSalesFunnelStatuses(),
      loadQuotationStatuses()
    ]);

    // --- Caja: exactamente lo de Finanzas, sumadas las cuentas ---
    const cashIn = sumSeries(overview.ingresos, allKeys.length);
    const cashOut = sumSeries(overview.egresos, allKeys.length);

    // --- Ventas cerradas: un proyecto por lead ganado ---
    const wonRows = await db('projects')
      .join('leads', 'leads.id', 'projects.lead_id')
      .leftJoin('users as closer', 'closer.id', 'leads.closer_user_id')
      .select(
        'leads.id',
        'leads.total_amount',
        'leads.source',
        'leads.deal_cancelled_at',
        'leads.closer_user_id',
        'closer.name as closer_name',
        db.raw("DATE_FORMAT(projects.created_at, '%Y-%m') as month")
      )
      .where('projects.created_at', '>=', windowStart)
      .where('projects.created_at', '<', windowEnd);

    const salesAmount = Object.fromEntries(allKeys.map((k) => [k, 0]));
    const salesCount = Object.fromEntries(allKeys.map((k) => [k, 0]));
    const cancelled = { count: 0, amount: 0 };
    const closers = new Map();
    for (const row of wonRows) {
      const amount = Number(row.total_amount) || 0;
      if (row.deal_cancelled_at) {
        if (inCurrent(row.month)) {
          cancelled.count += 1;
          cancelled.amount += amount;
        }
        continue;
      }
      if (salesAmount[row.month] === undefined) continue;
      salesAmount[row.month] += amount;
      salesCount[row.month] += 1;
      if (inCurrent(row.month)) {
        const key = row.closer_user_id || 0;
        const entry = closers.get(key) || {
          label: row.closer_name || 'Sin closer registrado',
          count: 0,
          amount: 0
        };
        entry.count += 1;
        entry.amount += amount;
        closers.set(key, entry);
      }
    }
    const salesAmountSeries = allKeys.map((k) => round2(salesAmount[k]));
    const salesCountSeries = allKeys.map((k) => salesCount[k]);

    // --- Cohorte de leads: los que entraron en la ventana completa ---
    const [
      leadRows,
      projectLeadIds,
      meetingRows,
      quoteLeadIds,
      contractLeadIds,
      collectedLeadIds,
      movedRows
    ] = await Promise.all([
      db('leads')
        .select(...LEAD_COHORT_COLUMNS, db.raw("DATE_FORMAT(created_at, '%Y-%m') as month"))
        .where('created_at', '>=', windowStart)
        .where('created_at', '<', windowEnd),
      db('projects').whereNotNull('lead_id').pluck('lead_id'),
      /*
       * Las reuniones con su desenlace. La cancelada no cuenta como cita
       * conseguida —el evento desapareció del calendario del asesor, así que no
       * hay nada a lo que ir—, pero la asistencia viaja igual para poder
       * anotarla: su `null` es "nadie lo registró" y son casi todas, así que
       * como paso de la cadena mostraría una fuga que es solo falta de
       * registro (ver `leadTraceability.js`).
       */
      db('scheduled_meetings').whereNotNull('lead_id')
        .select('lead_id', 'cancelled_at', 'attendance'),
      // Una propuesta sobre la mesa: el documento emitido o la etapa que lo
      // afirma. Los dos caminos hacen falta — el equipo negocia por WhatsApp y
      // a veces mueve la tarjeta antes de emitir nada.
      db('quotes').whereNotNull('lead_id').pluck('lead_id'),
      db('contracts').whereNotNull('lead_id').whereNot('status', 'anulado').pluck('lead_id'),
      // "Cobrado" es lo `verificado` y no lo `pagado`, el mismo criterio con el
      // que cuentan los libros de Finanzas y el reporte de Campañas.
      db('finance_income').whereNotNull('lead_id').where('estado', 'verificado').pluck('lead_id'),
      // Cuándo lo movió alguien por última vez. Con un JOIN sobre la ventana y
      // no con un `whereIn` de miles de ids, igual que el Reporte de Setters.
      db('lead_stage_changes as c')
        .join('leads', 'leads.id', 'c.lead_id')
        .where('leads.created_at', '>=', windowStart)
        .where('leads.created_at', '<', windowEnd)
        .groupBy('c.lead_id')
        .select('c.lead_id')
        .select(db.raw('MAX(c.created_at) as moved_at'))
    ]);
    const projectIds = new Set(projectLeadIds);
    const wonIds = new Set(
      leadRows
        .filter((l) => !l.deal_cancelled_at && (wonStatuses.has(l.status) || projectIds.has(l.id)))
        .map((l) => l.id)
    );

    const newLeads = Object.fromEntries(allKeys.map((k) => [k, 0]));
    for (const lead of leadRows) {
      if (newLeads[lead.month] !== undefined) newLeads[lead.month] += 1;
    }
    const currentLeads = leadRows.filter((l) => inCurrent(l.month));
    const previousLeads = leadRows.filter((l) => !inCurrent(l.month));
    const wonIn = (list) => list.filter((l) => wonIds.has(l.id)).length;

    /*
     * --- Trazabilidad marketing → ventas ---
     *
     * Los hechos se resuelven UNA vez por lead y se le pasan ya resueltos a
     * `leadTraceability.js`, que es puro: el mismo lead entra en la cadena, en
     * su plataforma y en las anotaciones, y clasificarlo tres veces es como se
     * llega a que los tres números no cuadren.
     */
    const activeMeetingIds = new Set(
      meetingRows.filter((m) => !m.cancelled_at).map((m) => m.lead_id)
    );
    const movedAtByLead = new Map(movedRows.map((r) => [r.lead_id, r.moved_at]));
    const traceCtx = {
      wonIds,
      meetingIds: activeMeetingIds,
      proposalIds: new Set([...quoteLeadIds, ...contractLeadIds]),
      collectedIds: new Set(collectedLeadIds),
      graduated: (lead) => leadHasGraduated(lead, salesStatuses),
      appointment: (lead) => isAppointmentStatus(lead.status),
      quoting: (lead) => isQuotationStatus(lead.status, quotationStatuses)
    };
    const traceEntries = currentLeads.map((lead) => {
      const reached = reachedSteps(lead, traceCtx);
      return {
        lead,
        reached,
        // Resuelto una vez por lead y no una vez por uso: `leadOrigin()` recorre
        // los tres bloques de atribución para desempatar por fecha.
        origin: leadOrigin(lead),
        // Una venta marcada como no concretada no cuenta como ganada (igual que
        // en Cobranzas), pero tampoco es un lead perdido en el funnel: si no
        // está en un desenlace de pérdida, sigue siendo un trato caído con su
        // etapa donde quedó, y por eso se decide por el status.
        lost: !reached.cerrado && LOST_STATUSES.has(lead.status),
        idleDays: daysBetween(movedAtByLead.get(lead.id) || lead.created_at, now)
      };
    });
    const trace = buildTrace(traceEntries);

    /*
     * Las dos anotaciones que NO son pasos de la cadena, por la misma razón las
     * dos: su valor vacío es "nadie lo registró" y no "no ocurrió", así que
     * puestas como paso mostrarían una fuga donde solo falta registro.
     */
    const cohortIds = new Set(currentLeads.map((l) => l.id));
    const attendance = { attended: 0, notAttended: 0, unknown: 0 };
    for (const meeting of meetingRows) {
      if (meeting.cancelled_at || !cohortIds.has(meeting.lead_id)) continue;
      if (meeting.attendance === 'asistio') attendance.attended += 1;
      else if (meeting.attendance === 'no_asistio') attendance.notAttended += 1;
      else attendance.unknown += 1;
    }
    const qualification = { yes: 0, no: 0, pending: 0 };
    for (const lead of currentLeads) {
      if (lead.qualified === null || lead.qualified === undefined) qualification.pending += 1;
      else if (lead.qualified) qualification.yes += 1;
      else qualification.no += 1;
    }
    /*
     * La cita que la etapa afirma y la agenda no tiene: el closer no la ve en
     * su Calendario y nadie puede ir a buscarla. Se cuenta aparte porque es lo
     * que explica que la cadena cuente más citas que reuniones — sin esta
     * cifra, la resta parece un error del reporte.
     */
    const appointmentWithoutMeeting = currentLeads.filter(
      (l) => isAppointmentStatus(l.status) && !activeMeetingIds.has(l.id)
    ).length;

    /*
     * El mismo reparto por fuente de marketing. La plataforma la contesta
     * `leadOrigin()` —el sello del origen, no el texto de `source`— y por eso
     * no es lo mismo que la tarjeta de canales de más abajo, que agrupa el
     * canal escrito a mano. Las dos cosas se nombran distinto en la pantalla.
     */
    const platforms = groupByOrigin(traceEntries, {
      // Las plataformas son cinco y las fija `leadOrigin()` (`PLATFORMS`), así
      // que no hace falta el cajón de "Otros" que sí necesitan los canales
      // escritos a mano: "Otro" ya es una de ellas, y es lo que se responde
      // cuando el origen no se reconoce — nunca "Meta" por descarte.
      keyOf: (entry) => entry.origin.platform || 'Otro',
      labelOf: (entry) => entry.origin.platform || 'Otro'
    });

    const channelMap = new Map();
    for (const lead of currentLeads) {
      const label = (lead.source || '').trim() || 'Sin origen';
      const entry = channelMap.get(label) || { label, leads: 0, won: 0, amount: 0 };
      entry.leads += 1;
      if (wonIds.has(lead.id)) {
        entry.won += 1;
        entry.amount += Number(lead.total_amount) || 0;
      }
      channelMap.set(label, entry);
    }
    const channels = topWithOther([...channelMap.values()], TOP_CHANNELS, 'leads').map((c) => ({
      ...c,
      amount: round2(c.amount),
      conversion: ratio(c.won, c.leads)
    }));

    // --- Cartera: lo que el cliente todavía debe ---
    const receivableRows = await db('finance_income as i')
      .leftJoin('leads', 'leads.id', 'i.lead_id')
      .select('i.monto', 'i.estado', 'i.due_date', 'i.fecha')
      .whereIn('i.estado', ['pendiente', 'pagado'])
      .whereNull('leads.deal_cancelled_at');

    const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]));
    const projectionKeys = nextMonthKeys(PROJECTION_MONTHS, now);
    const projection = Object.fromEntries(projectionKeys.map((k) => [k, 0]));
    let toVerify = 0;
    let toVerifyCount = 0;
    for (const row of receivableRows) {
      const amount = Number(row.monto) || 0;
      if (row.estado === 'pagado') {
        toVerify += amount;
        toVerifyCount += 1;
        continue;
      }
      const due = toDayKey(row.due_date) || toDayKey(row.fecha);
      const bucket = agingBucket(due, today);
      aging[bucket].amount += amount;
      aging[bucket].count += 1;
      if (bucket === 'por_vencer' && due && projection[due.slice(0, 7)] !== undefined) projection[due.slice(0, 7)] += amount;
    }
    const receivableTotal = Object.values(aging).reduce((s, b) => s + b.amount, 0);
    const overdueTotal = receivableTotal - aging.por_vencer.amount;

    // --- Efectividad: de lo que vencía cada mes, cuánto ya se pagó ---
    const dueRows = await db('finance_income as i')
      .leftJoin('leads', 'leads.id', 'i.lead_id')
      .select(db.raw("DATE_FORMAT(i.due_date, '%Y-%m') as month"))
      .sum('i.monto as pactado')
      .select(db.raw("SUM(CASE WHEN i.estado IN ('pagado', 'verificado') THEN i.monto ELSE 0 END) as cobrado"))
      .where('i.due_date', '>=', currentStart)
      .where('i.due_date', '<', windowEnd)
      .whereNull('leads.deal_cancelled_at')
      .groupBy('month');
    const dueByMonth = new Map(dueRows.map((r) => [r.month, r]));
    const collectionRate = keys.map((k) => {
      const r = dueByMonth.get(k);
      const pactado = round2(r?.pactado);
      const cobrado = round2(r?.cobrado);
      return { month: k, pactado, cobrado, rate: ratio(cobrado, pactado) };
    });

    /*
     * --- De dónde viene la caja: el primer pago contra las cuotas siguientes ---
     *
     * Son las cuotas VERIFICADAS, fechadas por `fecha` (el día en que entró el
     * dinero): el mismo universo que la caja de Finanzas, para que el reparto
     * se pueda comprobar contra "Cobrado". Lo `pagado` no entra — el cliente
     * dice que pagó y Finanzas todavía no dio el visto bueno.
     *
     * Un cierre dado por caído tampoco se excluye, al revés que la cartera: lo
     * ya verificado entró de verdad y sigue en los libros (una devolución es un
     * egreso del Libro Diario, no un cobro que se borra).
     *
     * Para decidir cuál es la primera cuota de cada lead hace falta su
     * cronograma COMPLETO y no solo lo que cayó en la ventana, de ahí la
     * segunda consulta: con el plan recortado, un lead cuyo primer pago entró
     * hace ocho meses tendría su segunda cuota contada como primer pago.
     */
    const incomeRows = await db('finance_income')
      .select('id', 'lead_id', 'monto')
      .select(db.raw("DATE_FORMAT(fecha, '%Y-%m') as month"))
      .where('estado', 'verificado')
      .where('fecha', '>=', windowStart)
      .where('fecha', '<', windowEnd);
    const incomeLeadIds = [...new Set(incomeRows.map((r) => r.lead_id).filter(Boolean))];
    const scheduleRows = incomeLeadIds.length
      ? await db('finance_income')
        .whereIn('lead_id', incomeLeadIds)
        .select('id', 'lead_id', 'due_date', 'fecha')
      : [];
    const firstIds = firstInstallmentIds(scheduleRows);

    const currentIncome = incomeRows.filter((r) => inCurrent(r.month));
    const incomeSplitNow = splitIncome(currentIncome, firstIds);
    const incomeSplitPrev = splitIncome(incomeRows.filter((r) => !inCurrent(r.month)), firstIds);
    const incomeMonthly = Object.fromEntries(
      incomeSplitNow.classes.map((c) => [c.key, Object.fromEntries(keys.map((k) => [k, 0]))])
    );
    for (const row of currentIncome) {
      const key = row.lead_id ? (firstIds.has(row.id) ? 'primer_pago' : 'siguientes') : 'sin_cliente';
      if (incomeMonthly[key][row.month] !== undefined) {
        incomeMonthly[key][row.month] += Number(row.monto) || 0;
      }
    }
    /*
     * Lo que entró por el Libro Diario en el período: la otra parte de la caja,
     * la que NO es el pago de un cliente. Se publica aparte y no se reparte
     * entre las dos áreas —no pertenece a ninguna—, pero tiene que estar: sin
     * ella, la suma del reparto no coincide con "Cobrado (caja)" y el que
     * compara las dos cifras se queda buscando el error.
     */
    const otherIncomeRow = await db('finance_journal')
      .select(db.raw('SUM(monto) as total'))
      .where('monto', '>', 0)
      .where('moneda', 'soles')
      .where('estado', 'pagado')
      .where('fecha', '>=', currentStart)
      .where('fecha', '<', windowEnd)
      .first();

    // --- Egresos del período por destino ---
    const [areaRows, salaryRow, commissionRow] = await Promise.all([
      db('finance_journal')
        .select('area')
        .select(db.raw('SUM(-monto) as total'))
        .where('monto', '<', 0)
        .where('moneda', 'soles')
        .where('estado', 'pagado')
        .where('fecha', '>=', currentStart)
        .where('fecha', '<', windowEnd)
        .groupBy('area'),
      db('finance_salaries')
        .select(db.raw('SUM(ABS(monto)) as total'))
        .where('moneda', 'soles')
        .where('estado', 'pagado')
        .where('kind', 'pago')
        .where('fecha', '>=', currentStart)
        .where('fecha', '<', windowEnd)
        .first(),
      db('sales_commissions')
        .select(db.raw('SUM(ABS(monto)) as total'))
        .where('estado', 'pagado')
        .whereNotNull('paid_at')
        .where('paid_at', '>=', currentStart)
        .where('paid_at', '<', windowEnd)
        .first()
    ]);
    const expenseRows = areaRows.map((r) => ({
      label: (r.area || '').trim() || 'Sin área',
      amount: round2(r.total)
    }));
    if (Number(salaryRow?.total)) expenseRows.push({ label: 'Planilla', amount: round2(salaryRow.total) });
    if (Number(commissionRow?.total)) expenseRows.push({ label: 'Comisiones', amount: round2(commissionRow.total) });
    const expenses = topWithOther(expenseRows.filter((r) => r.amount > 0), 7, 'amount')
      .map((r) => ({ ...r, amount: round2(r.amount) }));

    // --- KPIs, período actual contra el anterior ---
    const cur = (values) => sumRange(values, months, months * 2);
    const prev = (values) => sumRange(values, 0, months);
    const kpi = (current, previous) => ({ current, previous, change: percentChange(current, previous) });

    const salesNow = cur(salesAmountSeries);
    const salesPrev = prev(salesAmountSeries);
    const dealsNow = cur(salesCountSeries);
    const dealsPrev = prev(salesCountSeries);
    const inNow = cur(cashIn);
    const inPrev = prev(cashIn);
    const outNow = cur(cashOut);
    const outPrev = prev(cashOut);

    return {
      months,
      generatedAt: now.toISOString(),
      period: { months: keys, previous: prevKeys },
      kpis: {
        sales: kpi(salesNow, salesPrev),
        deals: kpi(dealsNow, dealsPrev),
        ticket: kpi(
          dealsNow ? round2(salesNow / dealsNow) : 0,
          dealsPrev ? round2(salesPrev / dealsPrev) : 0
        ),
        cashIn: kpi(inNow, inPrev),
        cashOut: kpi(outNow, outPrev),
        net: kpi(round2(inNow - outNow), round2(inPrev - outPrev)),
        margin: { current: ratio(inNow - outNow, inNow), previous: ratio(inPrev - outPrev, inPrev) },
        newLeads: kpi(currentLeads.length, previousLeads.length),
        conversion: {
          current: ratio(wonIn(currentLeads), currentLeads.length),
          previous: ratio(wonIn(previousLeads), previousLeads.length)
        }
      },
      monthly: {
        months: keys,
        sales: salesAmountSeries.slice(months),
        deals: salesCountSeries.slice(months),
        cashIn: cashIn.slice(months),
        cashOut: cashOut.slice(months),
        net: cashIn.slice(months).map((v, i) => round2(v - cashOut[months + i])),
        newLeads: keys.map((k) => newLeads[k])
      },
      traceability: {
        ...trace,
        platforms,
        annotations: {
          qualification,
          attendance,
          appointmentWithoutMeeting
        }
      },
      incomeMix: {
        ...incomeSplitNow,
        previous: incomeSplitPrev,
        monthly: Object.fromEntries(
          Object.entries(incomeMonthly).map(([key, byMonth]) => [key, keys.map((k) => round2(byMonth[k]))])
        ),
        otherIncome: round2(otherIncomeRow?.total),
        // La caja del período, para que el reparto se pueda leer contra el KPI
        // de "Cobrado" sin tener que sumar a mano las tres clases más lo otro.
        cashIn: inNow
      },
      channels,
      closers: [...closers.values()]
        .map((c) => ({ ...c, amount: round2(c.amount) }))
        .sort((a, b) => b.amount - a.amount),
      receivables: {
        total: round2(receivableTotal),
        overdue: round2(overdueTotal),
        overdueShare: ratio(overdueTotal, receivableTotal),
        toVerify: { amount: round2(toVerify), count: toVerifyCount },
        aging: AGING_BUCKETS.map((b) => ({
          ...b,
          amount: round2(aging[b.key].amount),
          count: aging[b.key].count
        })),
        projection: {
          overdue: round2(overdueTotal),
          months: projectionKeys.map((k) => ({ month: k, amount: round2(projection[k]) }))
        }
      },
      collectionRate,
      expenses,
      cancelled: { count: cancelled.count, amount: round2(cancelled.amount) },
      obligations: overview.totals?.pendientes || null
    };
  }
}
