/**
 * Configuracion del BFF, validada al arrancar.
 *
 * Si falta una variable o tiene un valor absurdo, el servidor no arranca y dice
 * exactamente cual es. Es preferible a fallar tres pantallas mas adelante con un
 * "undefined is not a function".
 */

import { z } from 'zod';

// Carga el .env de la raiz del monorepo. Node lo soporta de forma nativa desde
// la version 22, asi que no hace falta la dependencia dotenv.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Sin archivo .env se sigue adelante: en produccion las variables vienen del
  // entorno del proceso, no de un archivo.
}

const schema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  TRACCAR_URL: z.url().default('http://127.0.0.1:8082'),
  TRACCAR_API_TOKEN: z
    .string()
    .min(20, 'El token de Traccar parece incompleto')
    .refine((v) => !v.startsWith('pega-aqui'), {
      message:
        'TRACCAR_API_TOKEN sigue con el valor de ejemplo. Generalo en ' +
        'http://localhost:8082 (Cuenta -> Token) y pegalo en .env',
    }),

  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_DB: z.string().min(1).default('traccar'),
  POSTGRES_USER: z.string().min(1).default('traccar'),
  POSTGRES_PASSWORD: z.string().min(1),

  /**
   * Cada cuanto el relay vacia su buffer hacia los navegadores. Con 10 unidades
   * a 1 Hz, 750 ms convierte ~10 mensajes por segundo en ~1.3.
   */
  WS_FLUSH_INTERVAL_MS: z.coerce.number().int().min(100).max(10_000).default(750),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  · ${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('\n');
  console.error('\nConfiguracion invalida. Revisa tu archivo .env:\n');
  console.error(issues);
  console.error('\nPlantilla completa en .env.example\n');
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
