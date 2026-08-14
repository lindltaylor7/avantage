/**
 * Punto de entrada CommonJS para hosting basado en Phusion Passenger (p. ej.
 * Hostinger), que arranca la app con require(). El backend real es ESM
 * ("type": "module" en backend/package.json), así que aquí solo hacemos un
 * import() dinámico — la única forma soportada de cargar ESM desde CommonJS.
 */
import('./backend/server.js').catch((err) => {
  console.error('❌ No se pudo iniciar la aplicación:', err);
  process.exit(1);
});
