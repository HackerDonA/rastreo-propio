import type { FastifyBaseLogger } from 'fastify';

/**
 * Tipo del logger que se inyecta en las clases del proyecto.
 *
 * Se usa el de Fastify y no el `Logger` de pino a secas: `app.log` es un
 * `FastifyBaseLogger`, que es un pino ligeramente recortado. Tiparlo como pino
 * puro obliga a hacer un cast en cada inyeccion, que es justo lo que este
 * proyecto se comprometio a no hacer.
 */
export type AppLogger = FastifyBaseLogger;
