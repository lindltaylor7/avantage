/**
 * El origen de un lead pasa a ser un **sello**, y queda escrito con qué
 * evidencia se lo supo.
 *
 * El error que esto viene a cerrar estaba medido y corría solo. La importación
 * de leads de TikTok, cuando no encontraba la ficha por el `lead_id` del envío,
 * la buscaba por los **últimos 9 dígitos del teléfono** y, si daba con una, le
 * escribía campaña, grupo y anuncio. Como `leadOrigin()` preguntaba por las
 * columnas `tiktok_*` antes que por las demás, cualquier ficha que recibiera un
 * `tiktok_lead_id` por esa vía pasaba a ser "TikTok" en todas las hojas de
 * marketing y tapaba su origen real —el formulario de Meta o el clic que abrió
 * la conversación—. Y no era un botón que alguien aprieta mirando el resultado:
 * la conciliación diaria (`leadReconciliationSweep`) corre con `apply: true`,
 * así que eso se escribía sin supervisión, todos los días.
 *
 * Que TikTok reporte 21 leads y el CRM tenga 21 fichas del mismo corte no
 * empareja ninguna de las 21 con ninguna de las otras. **Coincidir no es
 * identificar**, y de estos números cuelga el reparto del presupuesto.
 *
 * Lo que se agrega:
 *
 *  - `origin_platform`: la plataforma de la que salió el lead, escrita UNA vez
 *    cuando la ficha nace y no vuelta a tocar nunca — un sello, como
 *    `sales_funnel_at` o `setter_user_id`. Lo que llegue después se informa
 *    aparte (`secondary` en `leadOrigin()`) en vez de reescribir la historia.
 *
 *  - `attribution_method` / `attribution_confidence`: CÓMO se emparejó el envío
 *    de la plataforma con esta ficha, y cuánto vale esa evidencia. Solo la
 *    confianza alta —el id que emitió la plataforma, el marcador que quedó en
 *    las notas, la recepción del webhook— habilita escribir campaña, grupo y
 *    anuncio. El teléfono sigue sirviendo para no duplicar a una persona, que
 *    es otro problema: dos fichas de la misma persona son un estorbo, una ficha
 *    con la plataforma equivocada es un presupuesto mal repartido.
 *
 *  - `attribution_reconciled_at`: cuándo se comparó esta ficha contra la
 *    plataforma. Se escribe incluso cuando la atribución NO se pudo resolver,
 *    porque "ya se la miró y quedó pendiente" es distinto de "nunca se la
 *    miró", y esa es la diferencia entre un pendiente y un agujero que nadie
 *    vio.
 *
 *  - `attribution_conflicts`: los emparejamientos que necesitan que los
 *    resuelva una persona. Un sufijo de teléfono que da con dos fichas no es un
 *    fallo del que haya que recuperarse eligiendo una: es un caso sin resolver,
 *    y elegir "la más reciente" es una moneda al aire.
 *
 * El backfill sella a los leads que ya existen con el MISMO código que resuelve
 * el origen en producción (`leadOrigin()`), no con una copia de sus reglas
 * escrita acá: una lógica duplicada en una migración es una lógica que el día
 * que se corrija va a seguir diciendo lo viejo en las fichas históricas. Como
 * las columnas nuevas nacen vacías, esa llamada cae en el desempate por fecha
 * de evidencia, que es lo más cerca de "cuál fue primero" a lo que se puede
 * llegar sin preguntarle nada a nadie.
 */
import { LEAD_ORIGIN_COLUMNS, leadOrigin } from '../../services/leadOrigin.js';
import { ATTRIBUTION_METHODS, confidenceFor } from '../../services/attributionEvidence.js';

/** Cuántos leads se traen por vuelta: la tabla entera no entra en memoria. */
const LOTE = 500;

/**
 * Con qué evidencia nació la atribución que esta ficha ya tiene.
 *
 * Los ids de envío (`leadgen_id`, `lead_id`) y el click id del `referral` son
 * identificadores que emitió la plataforma: no se llega a ellos por descarte.
 * Una ficha sin ninguno de los tres no tiene atribución que respaldar, y ahí el
 * método queda en null — que es información, no un hueco.
 */
function metodoHistorico(lead) {
  if (lead.tiktok_lead_id || lead.meta_leadgen_id) return ATTRIBUTION_METHODS.platformLeadId;
  if (lead.ctwa_clid) return ATTRIBUTION_METHODS.webhook;
  return null;
}

export async function up(knex) {
  await knex.schema.alterTable('leads', (table) => {
    // Los cinco valores de `PLATFORMS` en `leadOrigin.js` ("Meta", "TikTok",
    // "Orgánico", "Referido", "Otro"). Se guarda el texto que lee marketing y
    // no un código, porque es el mismo vocabulario de la hoja exportada.
    table.string('origin_platform', 20).nullable();
    table.string('attribution_method', 24).nullable();
    table.string('attribution_confidence', 10).nullable();
    table.timestamp('attribution_reconciled_at').nullable();

    table.index('origin_platform');
    table.index('attribution_confidence');
  });

  await knex.schema.createTable('attribution_conflicts', (table) => {
    table.increments('id').primary();

    // "Meta" o "TikTok": de qué plataforma venía el envío que no se pudo
    // emparejar.
    table.string('platform', 20).notNullable();
    /*
     * El id del envío en la plataforma (`lead_id` de TikTok, `leadgen_id` de
     * Meta). Es la llave con la que este pendiente se reconoce entre corridas:
     * sin ella, cada pasada de la conciliación diaria volvería a anotar el
     * mismo caso y la lista de pendientes crecería sola.
     */
    table.string('platform_lead_id', 64).nullable();
    // Los últimos 9 dígitos con los que se buscó, para poder reproducir el
    // caso sin guardar el teléfono completo en una tabla de diagnóstico.
    table.string('phone_key', 16).nullable();

    // `CONFLICT_REASONS` en `attributionEvidence.js`.
    table.string('reason', 32).notNullable();
    // Los ids de las fichas candidatas, como JSON. Son los que una persona
    // tiene que abrir para decidir.
    table.text('candidate_lead_ids').nullable();
    /*
     * La atribución que NO se escribió, tal como la mandó la plataforma. Se
     * guarda porque es lo que hay que aplicar si alguien resuelve el caso a
     * favor de una ficha: sin esto habría que volver a pedirle los datos a la
     * API, y TikTok conserva los leads de un formulario solo 90 días.
     */
    table.text('payload').nullable();

    table.timestamp('detected_at').defaultTo(knex.fn.now());
    table.timestamp('resolved_at').nullable();
    table.integer('resolved_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    // 'adjuntado' | 'descartado' | 'ficha_nueva'
    table.string('resolution', 20).nullable();
    table.string('notes', 500).nullable();

    /*
     * Un envío no genera dos pendientes. MySQL admite varios NULL en un índice
     * único, así que un conflicto sin id de plataforma (un formulario sin
     * celular ni lead_id legible) se sigue pudiendo anotar más de una vez — es
     * el caso raro y vale más anotarlo dos veces que perderlo.
     */
    table.unique(['platform', 'platform_lead_id']);
    table.index('reason');
    table.index('resolved_at');
  });

  /*
   * Sellado de lo que ya existe. Se recorre por lotes y por id ascendente para
   * que la migración no cargue la tabla entera ni dependa del orden del motor.
   */
  let ultimoId = 0;
  let sellados = 0;
  let conflictos = 0;

  for (;;) {
    const leads = await knex('leads')
      .select('id', ...LEAD_ORIGIN_COLUMNS)
      .where('id', '>', ultimoId)
      .orderBy('id', 'asc')
      .limit(LOTE);
    if (!leads.length) break;

    for (const lead of leads) {
      const origin = leadOrigin(lead);
      const method = metodoHistorico(lead);

      await knex('leads').where({ id: lead.id }).update({
        origin_platform: origin.platform,
        attribution_method: method,
        attribution_confidence: confidenceFor(method),
        /*
         * A propósito en null: estas fichas se sellaron con lo que ya tenían
         * guardado, no comparándolas contra la plataforma. Poner la fecha de
         * hoy haría creer que las 400 fichas históricas se conciliaron en el
         * minuto en que corrió la migración.
         */
        attribution_reconciled_at: null
      });
      sellados++;
      if (origin.conflict) conflictos++;
    }

    ultimoId = leads[leads.length - 1].id;
  }

  if (sellados) {
    console.log(`✅ [Migración] Origen sellado en ${sellados} lead(s).`);
    if (conflictos) {
      console.log(`⚠️  [Migración] ${conflictos} lead(s) tienen atribución de más de una plataforma: `
        + 'el origen quedó en la más antigua y el resto se informa como secundario '
        + '(columna "Plataforma secundaria" de la hoja "Ruta de leads").');
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('attribution_conflicts');

  await knex.schema.alterTable('leads', (table) => {
    table.dropIndex('attribution_confidence');
    table.dropIndex('origin_platform');

    table.dropColumn('attribution_reconciled_at');
    table.dropColumn('attribution_confidence');
    table.dropColumn('attribution_method');
    table.dropColumn('origin_platform');
  });
}
