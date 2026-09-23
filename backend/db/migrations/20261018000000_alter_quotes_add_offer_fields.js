/**
 * Completa `quotes` con los campos que la cotización que el equipo usa en la
 * práctica ya tenía impresos y el sistema no guardaba:
 *
 * - `code`: el código con el que el equipo la nombra ("51-SET-VL"). Si no se
 *   escribe, el documento sigue usando el correlativo CTZ-AAAA-0000.
 * - `estimated_time` y `status_label`: el bloque "Condiciones de la oferta"
 *   (tiempo estimado del servicio, estado de la cotización).
 * - `regular_amount` y `discount`: el precio de lista y el descuento
 *   exclusivo que se negocia. `amount` sigue siendo el precio FINAL acordado,
 *   que es el que manda para el cierre y el cronograma de pagos.
 * - `service_subtitle`, `warranty_text` y `commercial_terms`: la bajada del
 *   servicio, el bloque de garantía y las condiciones comerciales numeradas.
 *
 * Todo es opcional: una cotización vieja se sigue imprimiendo igual, con los
 * textos por defecto del documento.
 */
export function up(knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.string('code', 40).nullable();
    table.string('estimated_time', 60).nullable();
    table.string('status_label', 60).nullable();
    table.decimal('regular_amount', 10, 2).nullable();
    table.decimal('discount', 10, 2).nullable();
    table.string('service_subtitle', 250).nullable();
    table.text('warranty_text').nullable();
    table.text('commercial_terms').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.dropColumn('commercial_terms');
    table.dropColumn('warranty_text');
    table.dropColumn('service_subtitle');
    table.dropColumn('discount');
    table.dropColumn('regular_amount');
    table.dropColumn('status_label');
    table.dropColumn('estimated_time');
    table.dropColumn('code');
  });
}
