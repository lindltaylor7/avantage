import knexLib from 'knex';
import config from './knexfile.js';

/**
 * Instancia única de Knex compartida por toda la app.
 */
export const db = knexLib(config);
