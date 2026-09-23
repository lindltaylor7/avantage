/**
 * Reacomoda `finance_income.is_initial_payment` a la regla que ahora sostiene
 * el servicio: el pago que desbloquea el proyecto es la PRIMERA cuota del
 * cronograma del lead (vencimiento más antiguo), y solo esa.
 *
 * Hasta ahora el marcador se guardaba al crear el ingreso y no se volvía a
 * tocar, así que podía quedarse en una cuota posterior — por reordenar el
 * cronograma, o porque alguien registró "otro primer pago" para destrabar un
 * proyecto. Cuando eso pasa el proyecto no se activa nunca aunque el cliente
 * ya haya pagado la primera cuota, y desde Finanzas no hay forma de ver por
 * qué. Esta migración arregla los datos que quedaron así.
 *
 * Además promueve los proyectos que estaban bloqueados por ese desfase: si la
 * cuota que ahora marca el desbloqueo ya está verificada, el proyecto pasa de
 * "Creado" a "Activo", que es lo que habría hecho la verificación.
 */
export async function up(knex) {
  const leads = await knex('finance_income').whereNotNull('lead_id').distinct('lead_id');

  for (const { lead_id: leadId } of leads) {
    const rows = await knex('finance_income')
      .where({ lead_id: leadId })
      .select('id', 'estado', 'is_initial_payment')
      .orderBy('due_date', 'asc')
      .orderBy('fecha', 'asc')
      .orderBy('id', 'asc');
    // Un cierre que nunca tuvo marcador es anterior a este flujo: su proyecto
    // jamás estuvo bloqueado y ponerle uno ahora lo trabaría de golpe.
    if (rows.length === 0 || !rows.some((row) => row.is_initial_payment)) continue;

    const first = rows[0];
    const alreadyCorrect = rows.every((row) => Boolean(row.is_initial_payment) === (row.id === first.id));
    if (alreadyCorrect) continue;

    await knex('finance_income').where({ lead_id: leadId }).update({ is_initial_payment: false });
    await knex('finance_income').where({ id: first.id }).update({ is_initial_payment: true });

    // El proyecto estaba bloqueado por el desfase: si la cuota que ahora manda
    // ya está verificada, se activa como lo habría hecho la verificación.
    if (first.estado === 'verificado') {
      await knex('projects').where({ lead_id: leadId, status: 'Creado' }).update({ status: 'Activo' });
    }
  }
}

/**
 * No hay vuelta atrás posible ni deseable: el estado anterior era justamente
 * el marcador descolocado que esto corrige.
 */
export async function down() {}
