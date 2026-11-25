/**
 * De dónde viene cada sol que entra: del cierre de la venta o del trabajo que
 * vino después.
 *
 * Es la pregunta que el Reporte General no sabía contestar. "Cobrado (caja)"
 * decía una sola cifra, y debajo de ella hay dos negocios distintos que se
 * dirigen distinto: el **primer pago** es lo que produjo el área comercial al
 * cerrar el trato, y **las cuotas siguientes** las produce el área académica y
 * la gestión del proyecto —el cliente las paga porque el trabajo avanza y
 * porque alguien se las cobró—. Mezcladas, un mes que cobró bien no se puede
 * distinguir de un mes que vendió bien: una cartera vieja que paga puntual
 * sostiene la caja mientras nadie cierra una venta nueva, y al revés.
 *
 * ## Qué es "el primer pago"
 *
 * La PRIMERA cuota del cronograma del lead, la de vencimiento más antiguo. Se
 * deriva en cada lectura y **no se lee de `finance_income.is_initial_payment`**,
 * aunque esa columna exista y signifique justamente eso: el marcador solo está
 * puesto en los cierres posteriores al flujo que lo creó —"un cierre SIN
 * marcador no se toca", ver `#syncInitialPayment()`—, así que leyéndolo todas
 * las ventas anteriores quedarían con su primer pago contado como cuota de
 * académico. En una clasificación de porcentajes eso no falla: corre la cifra y
 * nadie se entera.
 *
 * El orden es el MISMO de `#syncInitialPayment()` (vencimiento, fecha, id), y
 * esa es la propiedad que sostiene la regla: donde el marcador existe, lo
 * derivado coincide con él. Con un orden propio habría dos respuestas a la
 * misma pregunta —cuál es el primer pago de este lead— y la pantalla de
 * Finanzas y este reporte dirían cosas distintas del mismo cierre.
 *
 * Tampoco se usa `finance_income.cuota`: ese ordinal es un texto que solo se
 * renumera cuando el plan se reemplaza entero, así que una cuota creada o
 * movida por otro camino queda diciendo "3era" siendo la primera que vence (es
 * la misma razón por la que `paymentNoticeService` calcula la posición en vez
 * de leerla).
 *
 * ## Lo que no se puede clasificar se dice
 *
 * Una cuota sin `lead_id` no tiene cronograma al que pertenecer, así que no se
 * puede saber si es un primer pago o una cuota posterior. Va a su propia clase
 * y no al cajón grande: repartirla por descarte entre las otras dos inventa un
 * porcentaje, y de estos porcentajes cuelga a qué área se le atribuye la caja
 * del mes.
 *
 * ## Un lead que pagó todo de una vez es primer pago
 *
 * Ese dinero lo produjo la venta y no la gestión posterior. Es la misma lectura
 * con la que el cierre adopta un cronograma ya cubierto y le pone el marcador a
 * su primera cuota (ver `ensureInitialPayment()`).
 */

/**
 * Las tres clases. `owner` es el área a la que se le atribuye ese dinero y es
 * lo que la pantalla escribe al lado del nombre: sin él, "primer pago" y
 * "cuotas siguientes" se leen como un detalle administrativo del cronograma en
 * vez de como las dos mitades del negocio.
 */
export const INCOME_CLASSES = [
  {
    key: 'primer_pago',
    label: 'Primer pago',
    owner: 'Ventas',
    what: 'La primera cuota del cronograma: lo que entró al cerrar el trato.'
  },
  {
    key: 'siguientes',
    label: 'Cuotas siguientes',
    owner: 'Académico y gestión',
    what: 'Lo que el cliente pagó después del cierre, mientras el trabajo avanzaba.'
  },
  {
    key: 'sin_cliente',
    label: 'Sin cliente asignado',
    owner: 'Sin clasificar',
    what: 'Cuotas sin lead: no tienen cronograma, así que no se puede decir de cuál de los dos vienen.'
  }
];

export const INCOME_CLASS_KEYS = INCOME_CLASSES.map((c) => c.key);

/**
 * Normaliza una fecha de mysql2 (Date o texto) a `YYYY-MM-DD` comparable como
 * texto. `null` para lo que no sea una fecha, que es lo que `compareSchedule`
 * necesita para decidir dónde va una cuota sin vencimiento.
 */
function dayOf(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

/**
 * El orden del cronograma, igual que lo lee Finanzas: vencimiento, fecha, id.
 *
 * Lo que no tiene vencimiento va PRIMERO y no último, porque así ordena MySQL
 * con `ORDER BY due_date ASC` —`NULL` antes que cualquier fecha— y es ese orden
 * el que decidió dónde quedó el marcador `is_initial_payment` de los cierres
 * que lo tienen. Ponerlo al final, que leído suelto parece más razonable, haría
 * que lo derivado y el marcador se contradijeran justo en las filas que tienen
 * las dos cosas.
 */
export function compareSchedule(a, b) {
  const dueA = dayOf(a.due_date);
  const dueB = dayOf(b.due_date);
  if (dueA !== dueB) {
    if (dueA === null) return -1;
    if (dueB === null) return 1;
    return dueA < dueB ? -1 : 1;
  }
  const fechaA = dayOf(a.fecha);
  const fechaB = dayOf(b.fecha);
  if (fechaA !== fechaB) {
    if (fechaA === null) return -1;
    if (fechaB === null) return 1;
    return fechaA < fechaB ? -1 : 1;
  }
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

/**
 * Los ids que son la primera cuota de su lead, uno por lead.
 *
 * Recibe el cronograma COMPLETO de cada lead y no solo las cuotas del período:
 * con la ventana recortada, un lead cuyo primer pago entró hace ocho meses
 * tendría su segunda cuota contada como primer pago, y el error crece justo con
 * la cartera vieja, que es la que más cuotas siguientes paga.
 */
export function firstInstallmentIds(rows) {
  const firstByLead = new Map();
  for (const row of rows) {
    if (!row.lead_id) continue;
    const current = firstByLead.get(row.lead_id);
    if (!current || compareSchedule(row, current) < 0) firstByLead.set(row.lead_id, row);
  }
  return new Set([...firstByLead.values()].map((row) => row.id));
}

/** La clase de una cuota, dados los ids que son primeros de su cronograma. */
export function classifyIncomeRow(row, firstIds) {
  if (!row.lead_id) return 'sin_cliente';
  return firstIds.has(row.id) ? 'primer_pago' : 'siguientes';
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Reparte las cuotas en sus tres clases, con los porcentajes ya calculados.
 *
 * El porcentaje se calcula sobre el total de lo clasificado y no sobre la caja
 * del período: la caja incluye además los ingresos del Libro Diario, que no son
 * el pago de ningún cliente y no pertenecen a ninguna de las dos áreas. Esa
 * diferencia se publica aparte; no se reparte.
 */
export function splitIncome(rows, firstIds) {
  const acc = Object.fromEntries(
    INCOME_CLASS_KEYS.map((key) => [key, { amount: 0, count: 0, leads: new Set() }])
  );
  for (const row of rows) {
    const key = classifyIncomeRow(row, firstIds);
    acc[key].amount += Number(row.monto) || 0;
    acc[key].count += 1;
    if (row.lead_id) acc[key].leads.add(row.lead_id);
  }
  const total = round2(INCOME_CLASS_KEYS.reduce((sum, key) => sum + acc[key].amount, 0));
  return {
    total,
    classes: INCOME_CLASSES.map((meta) => ({
      ...meta,
      amount: round2(acc[meta.key].amount),
      count: acc[meta.key].count,
      leads: acc[meta.key].leads.size,
      // `null` y no 0 cuando no entró nada: "no se cobró nada en el período" no
      // es "el 0% vino de ventas", y un cero ahí se lee como un diagnóstico.
      share: total ? Math.round((acc[meta.key].amount / total) * 1000) / 10 : null
    }))
  };
}
