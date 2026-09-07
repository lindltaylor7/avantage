/**
 * Agrega `started_at`: se llena SOLO cuando la conversación realmente
 * arrancó (el contacto escribió y el motor conversacional corrió su primer
 * turno) — a diferencia de `created_at`, que también se llena cuando
 * `setBotEnabled()` crea la fila de la sesión sin que haya habido ningún
 * mensaje todavía (ej. al tocar "Activar bot" en el panel justo después de
 * "Reiniciar").
 *
 * Antes, `isFirstTurn` en whatsappBotService.js se calculaba como `!session`
 * (¿existe la fila?), así que una fila creada solo por `setBotEnabled` hacía
 * que el turno REAL con el contacto se tratara como si no fuera el primero:
 * no se forzaba el saludo, y de hecho se activaba la limpieza que le quita el
 * saludo a una respuesta (`stripOpeningGreeting`), pensada solo para turnos
 * que de verdad continúan una conversación ya abierta.
 */
export function up(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.timestamp('started_at').nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable('whatsapp_bot_sessions', (table) => {
    table.dropColumn('started_at');
  });
}
