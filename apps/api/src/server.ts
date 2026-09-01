/**
 * Punto de entrada del BFF.
 *
 * Es la unica pieza que conoce el token de Traccar. El navegador nunca lo ve.
 * Ver docs/adr/0002-bff-propio.md.
 */

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';

import { config } from './config.ts';
import { closePool, pool } from './db.ts';
import { migrar } from './migrate.ts';
import { MaintenanceJob } from './modules/maintenance/job.ts';
import { asegurarNotificacionWeb } from './modules/events/bootstrap.ts';
import { registerGeofenceRoutes } from './modules/geofences/routes.ts';
import { registerMaintenanceRoutes } from './modules/maintenance/routes.ts';
import { registerVehicleRoutes } from './modules/vehicles/routes.ts';
import { registerFleetRoutes } from './routes/fleet.ts';
import { registerUnitRoutes } from './routes/units.ts';
import { TraccarClient, TraccarError } from './traccar/client.ts';
import { TraccarRelay } from './traccar/relay.ts';

// En desarrollo el log pasa por pino-pretty para que sea legible; en produccion
// se deja en JSON, que es lo que esperan los agregadores de logs.
// Con exactOptionalPropertyTypes no se puede pasar `transport: undefined`, asi
// que la propiedad se agrega solo cuando corresponde.
const isProduction = process.env['NODE_ENV'] === 'production';
const app = Fastify({
  logger: isProduction
    ? { level: config.LOG_LEVEL }
    : {
        level: config.LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
});

const client = new TraccarClient(app.log);
const relay = new TraccarRelay(client, app.log);
const maintenanceJob = new MaintenanceJob(client, app.log);

// ----------------------------------------------------------------------------
//  Manejo de errores centralizado
// ----------------------------------------------------------------------------

// El generico se declara explicitamente: sin el, TypeScript lo infiere como
// `unknown` a partir de las comprobaciones instanceof de adentro y se pierde el
// acceso a statusCode.
app.setErrorHandler<FastifyError>((error, request, reply) => {
  if (error instanceof ZodError) {
    void reply.status(400).send({
      error: 'Peticion invalida',
      details: error.issues.map((i) => ({
        campo: i.path.join('.'),
        problema: i.message,
      })),
    });
    return;
  }

  if (error instanceof TraccarError) {
    request.log.error({ err: error.message }, 'Error hablando con Traccar');
    void reply.status(error.status === 401 ? 502 : error.status).send({
      error: 'Error al consultar Traccar',
      message: error.message,
    });
    return;
  }

  request.log.error({ err: error }, 'Error no controlado');
  void reply.status(error.statusCode ?? 500).send({
    error: 'Error interno del servidor',
  });
});

// ----------------------------------------------------------------------------
//  Arranque
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(websocket);

  /** Sonda de salud: comprueba de verdad la base y el enlace con Traccar. */
  app.get('/health', async () => {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await pool.query('SELECT 1');
      checks['postgres'] = 'ok';
    } catch {
      checks['postgres'] = 'error';
      healthy = false;
    }

    checks['traccarSocket'] = relay.isConnected ? 'conectado' : 'desconectado';
    if (!relay.isConnected) healthy = false;

    return {
      status: healthy ? 'ok' : 'degradado',
      checks,
      wsClients: relay.clientCount,
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  registerUnitRoutes(app, client, relay);
  registerFleetRoutes(app, client);
  registerMaintenanceRoutes(app, client);
  registerGeofenceRoutes(app, client);
  registerVehicleRoutes(app);

  /** WebSocket propio hacia el navegador. */
  app.get('/ws', { websocket: true }, (socket) => {
    const wrapper = {
      send: (data: string): void => {
        socket.send(data);
      },
    };
    relay.addClient(wrapper);
    socket.on('close', () => {
      relay.removeClient(wrapper);
    });
    socket.on('error', () => {
      relay.removeClient(wrapper);
    });
  });

  // Las migraciones del esquema `app` corren ANTES de aceptar trafico. Si
  // fallan, el servidor no arranca: es preferible a servir peticiones contra un
  // esquema a medias.
  await migrar(app.log);

  // El catalogo inicial de unidades se carga antes de aceptar trafico, para que
  // el primer mensaje del WebSocket ya pueda construir unidades completas.
  try {
    relay.setDevices(await client.getDevices());
    const geocercas = await client.getGeofences();
    relay.setGeofenceNames(new Map(geocercas.map((g) => [g.id, g.name])));

    // Sin esto, Traccar genera los eventos pero no los empuja al WebSocket, y
    // el frontend nunca recibe un aviso en vivo.
    await asegurarNotificacionWeb(client, app.log);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.log.warn({ err: message }, 'No se pudo cargar el catalogo inicial de unidades');
  }

  await relay.start();
  maintenanceJob.start();

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`API lista en http://${config.API_HOST}:${config.API_PORT}`);
}

// ----------------------------------------------------------------------------
//  Apagado ordenado
// ----------------------------------------------------------------------------

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info('Cerrando...');
    relay.stop();
    maintenanceJob.stop();
    void app
      .close()
      .then(closePool)
      .finally(() => {
        process.exit(0);
      });
  });
}

main().catch((error: unknown) => {
  app.log.error({ err: error }, 'No se pudo arrancar el servidor');
  process.exit(1);
});
