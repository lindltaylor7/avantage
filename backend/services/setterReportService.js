import { db } from '../db/connection.js';
import { applyLeadVisibility } from './leadService.js';
import { buildStatusLabeler, loadFunnelStageIndex } from './funnelStageLabel.js';
import { LOST_STATUSES, leadHasGraduated, loadWinningStatuses } from './salesFunnelStage.js';
import {
  firstDayAfter,
  firstDayOf,
  lastMonthKeys,
  normalizeMonths,
  percentChange,
  ratio
} from './reportPeriod.js';

/**
 * Reporte de Setters: cómo le fue a cada setter, mes a mes.
 *
 * **No tiene tabla propia** —como Cobranzas y el Reporte de Leads—: son los
 * leads, sus reuniones y sus cierres mirados desde la pregunta de quien dirige
 * el área ("¿cuántos leads le tocaron a cada uno, cuántas reuniones consiguió y
 * en qué quedaron?"). Guardar esas cifras en una tabla propia obligaría a
 * reescribirlas en cada movimiento de lead, y el día que se desincronicen nadie
 * sabría cuál dice la verdad.
 *
 * Cuatro decisiones sostienen todo lo que muestra la pantalla:
 *
 * 1. **A quién se le atribuye un lead: `setter_user_id` y, si no hay sello,
 *    `assigned_user_id`.** El sello se escribe UNA vez, en el instante de la
 *    graduación, con quien tenía el lead entonces (ver `commissionService`), y
 *    es lo que sobrevive a que la ficha pase al closer — mirar solo el
 *    responsable actual atribuiría al closer cada lead que se cerró. Antes de
 *    graduar no hay sello todavía, y ahí el responsable ES quien lo está
 *    trabajando. Es la misma pareja de columnas de la que cuelga la comisión de
 *    la setter, así que el reporte y lo que se le paga no pueden discrepar.
 *    Se resuelve en JavaScript (`attributedSetterId()`) y no con un COALESCE en
 *    SQL para que la regla exista una sola vez.
 *
 * 2. **Los resultados se miden por COHORTE y la actividad por fecha del hecho.**
 *    "Leads de octubre" son los que ENTRARON en octubre, y sus reuniones y sus
 *    cierres cuentan en octubre aunque hayan ocurrido en noviembre: es la única
 *    forma de que las tasas compartan denominador (contar reuniones del mes
 *    contra leads del mes mezcla gente que entró en momentos distintos y da
 *    porcentajes mayores al 100%). Es el mismo criterio del Reporte General.
 *    El precio de la cohorte es que el trabajo hecho este mes sobre leads
 *    viejos no aparece, y por eso va aparte la **actividad registrada**
 *    (`lead_stage_changes` del período, fechada por el movimiento y no por el
 *    lead), que es lo único que sí contesta "¿qué hizo esta persona este mes?".
 *    Las dos cosas se nombran distinto en la pantalla a propósito.
 *
 * 3. **Qué significa cada desenlace se pregunta donde ya está contestado**:
 *    `loadWinningStatuses()` para la venta ganada (con el proyecto abierto como
 *    respaldo, igual que en Campañas y el Reporte General), `LOST_STATUSES`
 *    para la pérdida, `leadHasGraduated()` para el pase a Ventas y
 *    `buildStatusLabeler()` para el nombre de la etapa. Ninguna lista propia:
 *    las columnas de los dos tableros las crea el equipo y sus claves se
 *    generan solas (`col_mtc2nwec_fij`).
 *
 * 4. **La visibilidad es la del funnel, no una propia.** Reusa
 *    `leadService.visibilityQueryFor()` + `applyLeadVisibility()`, así que el
 *    reporte no puede ser una puerta de atrás a los leads que alguien no ve en
 *    su tablero: quien ve solo lo suyo ve una sola fila, la de su propio
 *    desempeño. `scope` viaja a la pantalla para que lo explique en vez de
 *    parecer vacía por error. De acá no sale ningún dato de un lead concreto
 *    —solo conteos—, pero un conteo sobre los leads de otra persona también es
 *    información sobre esos leads.
 *
 * **No muestra importes.** Lo que mide a un setter es cuántos leads trabajó,
 * cuántas reuniones consiguió y cuántos terminaron en venta; cuánto facturó
 * cada venta se consulta en Finanzas y en el Reporte General, que tienen el
 * permiso del dinero. Es la misma regla que en Proyectos y en Entregables.
 */

/** Cuántas etapas distintas se detallan por setter antes de agrupar el resto. */
const TOP_STAGES = 6;

/**
 * El setter al que se le atribuye este lead. Ver la decisión 1 del encabezado:
 * primero el sello de la graduación y después el responsable actual.
 */
export function attributedSetterId(lead) {
  return lead?.setter_user_id || lead?.assigned_user_id || null;
}

/**
 * Días (con un decimal) entre dos marcas de tiempo, o `null` si alguna no es
 * una fecha.
 *
 * Un resultado negativo se trata como 0 y no como dato inválido: pasa cuando la
 * reunión se agendó antes de que la ficha del lead existiera (el bot agenda y
 * después se cuelga el lead de otra ficha), y ahí "el mismo día" es la lectura
 * honesta.
 */
export function daysBetween(from, to) {
  const a = from instanceof Date ? from.getTime() : Date.parse(from);
  const b = to instanceof Date ? to.getTime() : Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round(((b - a) / 86400000) * 10) / 10);
}

/**
 * La mediana y no el promedio: un solo lead que se agendó seis meses después
 * corre el promedio de todo el equipo, y lo que se quiere saber es cuánto tarda
 * el caso típico.
 */
export function median(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  const value = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  return Math.round(value * 10) / 10;
}

/** El acumulador de un conjunto de leads: un solo sitio define qué se cuenta. */
export function emptyStats() {
  return {
    leads: 0,
    graduated: 0,
    withMeeting: 0,
    meetings: 0,
    meetingsCancelled: 0,
    meetingsManual: 0,
    won: 0,
    wonWithMeeting: 0,
    lost: 0,
    open: 0,
    openSetter: 0,
    openSales: 0,
    unmoved: 0,
    daysToMeeting: null,
    daysToWin: null
  };
}

/**
 * En qué quedó un lead. Las cuatro preguntas se contestan juntas porque las
 * cuatro dependen del mismo contexto, y separarlas invitaría a que una pantalla
 * conteste "ganado" con un criterio y otra con otro.
 *
 * `won` tiene dos caminos y hacen falta los dos: el status ganador configurado
 * y —de respaldo— que el lead ya tenga proyecto abierto. Si alguien recrea la
 * columna sin marcarla `final`, el proyecto sigue ahí, y contar como "en
 * proceso" a un cliente al que ya se le entrega trabajo es el peor error.
 * Una venta marcada como no concretada (`deal_cancelled_at`) no cuenta como
 * ganada, igual que en Cobranzas y en el Reporte General.
 */
export function classifyLead(lead, { wonStatuses, salesStatuses, projectIds, meetingsByLead }) {
  const won = !lead.deal_cancelled_at
    && (wonStatuses.has(lead.status) || projectIds.has(lead.id));

  return {
    won,
    lost: !won && LOST_STATUSES.has(lead.status),
    graduated: leadHasGraduated(lead, salesStatuses),
    meeting: meetingsByLead.get(lead.id) || null
  };
}

/**
 * Resume un conjunto de leads ya clasificados. Recibe la clasificación hecha y
 * no la repite: el mismo lead se cuenta en el total del equipo, en el de su
 * setter y en el de su mes, y clasificarlo tres veces es como se llega a que
 * los tres números no cuadren.
 */
export function summarize(entries) {
  const stats = emptyStats();
  const toMeeting = [];
  const toWin = [];

  for (const { lead, verdict, movedAt } of entries) {
    stats.leads += 1;
    if (verdict.graduated) stats.graduated += 1;
    if (!movedAt) stats.unmoved += 1;

    const meeting = verdict.meeting;
    if (meeting) {
      stats.meetings += meeting.active;
      stats.meetingsCancelled += meeting.cancelled;
      stats.meetingsManual += meeting.manual;
      if (meeting.active > 0) {
        stats.withMeeting += 1;
        const days = daysBetween(lead.created_at, meeting.firstBookedAt);
        if (days !== null) toMeeting.push(days);
      }
    }

    if (verdict.won) {
      stats.won += 1;
      if (meeting?.active > 0) stats.wonWithMeeting += 1;
      const days = daysBetween(lead.created_at, verdict.wonAt);
      if (days !== null) toWin.push(days);
    } else if (verdict.lost) {
      stats.lost += 1;
    } else {
      stats.open += 1;
      if (verdict.graduated) stats.openSales += 1;
      else stats.openSetter += 1;
    }
  }

  stats.daysToMeeting = median(toMeeting);
  stats.daysToWin = median(toWin);
  return withRates(stats);
}

/**
 * Las tasas se derivan en cada lectura y no se guardan, por lo mismo que el
 * porcentaje de un pago de salario o el `is_locked` de un hito: corregido un
 * lead, una tasa guardada seguiría diciendo la vieja.
 */
export function withRates(stats) {
  return {
    ...stats,
    graduationRate: ratio(stats.graduated, stats.leads),
    meetingRate: ratio(stats.withMeeting, stats.leads),
    winRate: ratio(stats.won, stats.leads),
    lossRate: ratio(stats.lost, stats.leads),
    /*
     * De los leads que SÍ consiguieron reunión, cuántos terminaron en venta.
     * Va separada de `winRate` porque es la mitad del trabajo que no es del
     * setter: uno con mucha reunión y poco cierre no tiene el mismo problema
     * que uno que no consigue reuniones.
     *
     * El numerador es `wonWithMeeting` y no `won`: hay ventas que se cierran
     * sin reunión agendada (el closer cierra por WhatsApp, o la reunión nunca
     * se cargó al panel), y con el total de ganados arriba la tasa pasaba del
     * 100% — se vio en la prueba contra la base: 4 ganados sobre 2 leads con
     * reunión daba "200%". Una tasa que supera el 100% no es un dato, es un
     * aviso de que el numerador no pertenece al denominador.
     */
    meetingToWinRate: ratio(stats.wonWithMeeting, stats.withMeeting)
  };
}

/** Las etapas más pobladas primero y el resto junto: una barra por etapa no se lee. */
export function topStages(counts, limit = TOP_STAGES) {
  const rows = [...counts.values()].sort((a, b) => b.count - a.count);
  if (rows.length <= limit) return rows;
  const resto = rows.slice(limit);
  return [
    ...rows.slice(0, limit),
    {
      status: '__otras__',
      label: resto.length === 1 ? 'Otra etapa' : `Otras ${resto.length} etapas`,
      icon: null,
      color: null,
      board: null,
      count: resto.reduce((total, row) => total + row.count, 0),
      isOther: true
    }
  ];
}

export class SetterReportService {
  constructor({ leadService, userService }) {
    this.leads = leadService;
    this.users = userService;
  }

  async report(user, query = {}, now = new Date()) {
    const months = normalizeMonths(query.months);
    // Se trae el doble de meses: la mitad vieja es el período de comparación.
    const allKeys = lastMonthKeys(months * 2, now);
    const keys = allKeys.slice(months);
    const prevKeys = allKeys.slice(0, months);
    const windowStart = firstDayOf(allKeys[0]);
    const currentStart = firstDayOf(keys[0]);
    const windowEnd = firstDayAfter(keys[keys.length - 1]);

    const visibility = await this.leads.visibilityQueryFor(user);
    const enVentana = (consulta) => consulta
      .where('leads.created_at', '>=', windowStart)
      .where('leads.created_at', '<', windowEnd);

    const [index, wonStatuses, leadRows, meetingRows, projectRows, movedRows, activityRows, equipo] =
      await Promise.all([
        loadFunnelStageIndex(),
        loadWinningStatuses(),

        enVentana(applyLeadVisibility(db('leads'), visibility)).select(
          'leads.id',
          'leads.status',
          'leads.sales_funnel_at',
          'leads.created_at',
          'leads.deal_cancelled_at',
          'leads.setter_user_id',
          'leads.assigned_user_id',
          db.raw("DATE_FORMAT(leads.created_at, '%Y-%m') as month")
        ),

        // Las reuniones de esos leads, agrupadas por LEAD y no por mes de la
        // reunión: la cohorte es el lead (ver decisión 2).
        enVentana(
          applyLeadVisibility(
            db('scheduled_meetings as m').join('leads', 'leads.id', 'm.lead_id'),
            visibility
          )
        ).select('m.lead_id', 'm.created_at', 'm.cancelled_at', 'm.source'),

        // El proyecto es el día del cierre: nace cuando se gana el lead.
        enVentana(
          applyLeadVisibility(
            db('projects').join('leads', 'leads.id', 'projects.lead_id'),
            visibility
          )
        ).select('projects.lead_id', 'projects.created_at as won_at'),

        // Qué leads de la cohorte movió alguien alguna vez. Se pregunta con un
        // JOIN sobre la ventana y no con un `whereIn` de miles de ids.
        enVentana(
          applyLeadVisibility(
            db('lead_stage_changes as c').join('leads', 'leads.id', 'c.lead_id'),
            visibility
          )
        )
          .groupBy('c.lead_id')
          .select('c.lead_id')
          .select(db.raw('MAX(c.created_at) as moved_at')),

        // Actividad del período: fechada por el movimiento, no por el lead.
        applyLeadVisibility(
          db('lead_stage_changes as c').join('leads', 'leads.id', 'c.lead_id'),
          visibility
        )
          .where('c.created_at', '>=', currentStart)
          .where('c.created_at', '<', windowEnd)
          .whereNotNull('c.actor_id')
          .groupBy('c.actor_id')
          .select('c.actor_id')
          .select(db.raw('COUNT(*) as moves'))
          .select(db.raw('SUM(CASE WHEN c.blocked = 1 THEN 1 ELSE 0 END) as blocked'))
          .select(db.raw('COUNT(DISTINCT c.lead_id) as leads_touched')),

        this.users.listCommercialTeam()
      ]);

    const labelStatus = buildStatusLabeler(index);

    // --- Reuniones por lead ---
    const meetingsByLead = new Map();
    for (const row of meetingRows) {
      const entry = meetingsByLead.get(row.lead_id)
        || { active: 0, cancelled: 0, manual: 0, firstBookedAt: null };
      // Una reunión cancelada en Google no es una reunión conseguida: se cuenta
      // aparte para que se vea cuántas se cayeron (ver `calendarSyncService`).
      if (row.cancelled_at) entry.cancelled += 1;
      else entry.active += 1;
      // Solo las que siguen en pie: `manual` se muestra junto a las reuniones
      // conseguidas, y contar ahí una cancelada daría más "a mano" que
      // reuniones.
      if (row.source === 'manual' && !row.cancelled_at) entry.manual += 1;
      if (!entry.firstBookedAt || Date.parse(row.created_at) < Date.parse(entry.firstBookedAt)) {
        entry.firstBookedAt = row.created_at;
      }
      meetingsByLead.set(row.lead_id, entry);
    }

    const wonAtByLead = new Map();
    for (const row of projectRows) {
      const previo = wonAtByLead.get(row.lead_id);
      if (!previo || Date.parse(row.won_at) < Date.parse(previo)) {
        wonAtByLead.set(row.lead_id, row.won_at);
      }
    }
    const projectIds = new Set(wonAtByLead.keys());
    const movedAtByLead = new Map(movedRows.map((row) => [row.lead_id, row.moved_at]));

    const ctx = { wonStatuses, salesStatuses: index.salesStatuses, projectIds, meetingsByLead };

    // --- Una sola pasada: cada lead cae en su setter, su mes y su período ---
    const porSetter = new Map();
    const actuales = [];
    const anteriores = [];
    const sinResponsable = { leads: 0, won: 0, withMeeting: 0 };
    /*
     * Las etapas del equipo entero se acumulan en la misma pasada y no sumando
     * después las listas de cada setter: esas vienen recortadas a las más
     * pobladas (`topStages`), así que sumarlas mezclaría los "Otras N etapas"
     * de cada uno en un cajón que no significa nada.
     *
     * La clave de cada etapa lleva el TABLERO además del status porque
     * `cita_agendada` existe como columna en los dos, y la etiqueta del tablero
     * equivocado diría que el lead está donde no está.
     */
    const etapasEquipo = new Map();

    for (const row of leadRows) {
      const verdict = classifyLead(row, ctx);
      verdict.wonAt = verdict.won ? wonAtByLead.get(row.id) || null : null;
      const entry = { lead: row, verdict, movedAt: movedAtByLead.get(row.id) || null };
      const esActual = row.month >= keys[0];

      if (esActual) actuales.push(entry);
      else anteriores.push(entry);
      if (!esActual) continue;

      /*
       * La etapa se cuenta para el equipo ANTES de preguntar de quién es el
       * lead: "¿en qué etapa están los leads del período?" incluye los que
       * nadie tiene asignados. Contándola después, el detalle sumaba 13 de 16
       * y sus porcentajes no cerraban con los de las tarjetas de arriba.
       */
      const board = verdict.graduated ? 'ventas' : 'setter';
      const stageKey = `${board}:${row.status || ''}`;
      const anotarEtapa = (mapa) => {
        if (!mapa.has(stageKey)) {
          const stage = labelStatus(row.status, board);
          mapa.set(stageKey, {
            status: row.status || null,
            label: stage?.label || 'Sin etapa',
            icon: stage?.icon || null,
            color: stage?.color || null,
            board,
            count: 0
          });
        }
        mapa.get(stageKey).count += 1;
      };
      anotarEtapa(etapasEquipo);

      const ownerId = attributedSetterId(row);
      if (!ownerId) {
        // Un lead sin responsable no es de nadie, y por eso no se reparte entre
        // los setters: se informa aparte. Repartido, inflaría a alguien que no
        // lo trabajó; escondido, haría que los totales no cuadren con la tabla.
        sinResponsable.leads += 1;
        if (verdict.won) sinResponsable.won += 1;
        if (verdict.meeting?.active > 0) sinResponsable.withMeeting += 1;
        continue;
      }

      if (!porSetter.has(ownerId)) {
        porSetter.set(ownerId, {
          id: ownerId,
          entries: [],
          monthly: new Map(keys.map((key) => [key, []])),
          stages: new Map()
        });
      }
      const setter = porSetter.get(ownerId);
      setter.entries.push(entry);
      setter.monthly.get(row.month)?.push(entry);

      anotarEtapa(setter.stages);
    }

    // --- Nombres: el equipo comercial de hoy, más quien ya no está en él ---
    const porId = new Map(equipo.map((miembro) => [miembro.id, miembro]));
    const desconocidos = [...porSetter.keys()].filter((id) => !porId.has(id));
    if (desconocidos.length > 0) {
      const afuera = await db('users')
        .leftJoin('roles', 'roles.id', 'users.role_id')
        .whereIn('users.id', desconocidos)
        .select('users.id', 'users.name', 'roles.name as role_name');
      for (const fila of afuera) porId.set(fila.id, { ...fila, formerMember: true });
    }

    const actividad = new Map(activityRows.map((row) => [row.actor_id, row]));

    const setters = [...porSetter.values()]
      .map((setter) => {
        const persona = porId.get(setter.id) || null;
        const movimientos = actividad.get(setter.id) || null;
        const delMes = (key) => setter.monthly.get(key) || [];

        return {
          id: setter.id,
          name: persona?.name || 'Usuario dado de baja',
          role: persona?.role_name || null,
          // Quien ya no tiene acceso al funnel sigue apareciendo con sus leads
          // del período: sacarlo de la tabla haría que los totales del equipo
          // no cuadren con la suma de sus filas, que es lo primero que se
          // revisa cuando un reporte no se entiende.
          formerMember: Boolean(persona?.formerMember) || !persona,
          ...summarize(setter.entries),
          activity: {
            moves: Number(movimientos?.moves || 0),
            blocked: Number(movimientos?.blocked || 0),
            leadsTouched: Number(movimientos?.leads_touched || 0)
          },
          stages: topStages(setter.stages),
          monthly: {
            months: keys,
            leads: keys.map((key) => delMes(key).length),
            withMeeting: keys.map((key) => delMes(key).filter((e) => e.verdict.meeting?.active > 0).length),
            won: keys.map((key) => delMes(key).filter((e) => e.verdict.won).length)
          }
        };
      })
      .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, 'es'));

    const actual = summarize(actuales);
    const previo = summarize(anteriores);

    const porMes = new Map(keys.map((key) => [key, []]));
    for (const entry of actuales) porMes.get(entry.lead.month)?.push(entry);
    const delMes = (key) => porMes.get(key) || [];

    const kpi = (campo) => ({
      current: actual[campo],
      previous: previo[campo],
      change: percentChange(actual[campo], previo[campo])
    });
    // Una tasa no se compara en porcentaje de porcentaje: se compara en puntos.
    const puntos = (campo) => ({ current: actual[campo], previous: previo[campo] });

    return {
      months,
      generatedAt: now.toISOString(),
      scope: visibility.scope,
      period: { months: keys, previous: prevKeys },
      team: actual,
      teamStages: topStages(etapasEquipo),
      previous: previo,
      kpis: {
        leads: kpi('leads'),
        withMeeting: kpi('withMeeting'),
        meetings: kpi('meetings'),
        won: kpi('won'),
        meetingRate: puntos('meetingRate'),
        winRate: puntos('winRate'),
        meetingToWinRate: puntos('meetingToWinRate'),
        daysToMeeting: puntos('daysToMeeting')
      },
      monthly: {
        months: keys,
        leads: keys.map((key) => delMes(key).length),
        withMeeting: keys.map((key) => delMes(key).filter((e) => e.verdict.meeting?.active > 0).length),
        won: keys.map((key) => delMes(key).filter((e) => e.verdict.won).length),
        graduated: keys.map((key) => delMes(key).filter((e) => e.verdict.graduated).length)
      },
      setters,
      unassigned: sinResponsable
    };
  }
}
