/**
 * Punto de entrada del BFF.
 *
 * Es la unica pieza que conoce el token de Traccar. El navegador nunca lo ve.
 * Ver docs/adr/0002-bff-propio.md.
 */

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';

import { randomBytes } from 'node:crypto';

import { config } from './config.ts';
import { closePool, pool } from './db.ts';
import { migrar } from './migrate.ts';
import { MaintenanceJob } from './modules/maintenance/job.ts';
import { registerCommandRoutes } from './modules/commands/routes.ts';
import { asegurarNotificacionWeb } from './modules/events/bootstrap.ts';
import { registerGeofenceRoutes } from './modules/geofences/routes.ts';
import { registerHistoryRoutes } from './modules/history/routes.ts';
import { registerShareRoutes } from './modules/share/routes.ts';
import { registerMaintenanceRoutes } from './modules/maintenance/routes.ts';
import { registerVehicleRoutes } from './modules/vehicles/routes.ts';
import { registerAuthRoutes } from './routes/auth.ts';
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

  const estado = error.statusCode ?? 500;

  /*
   * Los 4xx los provoca la peticion, no el servidor.
   *
   * Antes caian todos en la rama de abajo, que conserva el codigo pero
   * reemplaza el mensaje por "Error interno del servidor". El resultado era
   * que pasarse del limite de intentos al entrar contestaba 429 con ese texto,
   * y quien lo leia entendia que la aplicacion estaba rota cuando lo unico que
   * tenia que hacer era esperar un minuto.
   *
   * El mensaje de un 4xx es seguro de mostrar: describe que tiene de malo la
   * peticion, no como esta hecho el servidor por dentro.
   */
  if (estado >= 400 && estado < 500) {
    if (estado === 429) {
      void reply.status(429).send({
        error: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
      });
      return;
    }
    void reply.status(estado).send({ error: error.message });
    return;
  }

  request.log.error({ err: error }, 'Error no controlado');
  void reply.status(estado).send({
    error: 'Error interno del servidor',
  });
});

// ----------------------------------------------------------------------------
//  Arranque
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const protegido = (config.AUTH_PASSWORD_HASH ?? '') !== '';
  const soloLocal = config.API_HOST === '127.0.0.1' || config.API_HOST === 'localhost';

  /*
   * SALVAGUARDA DE ARRANQUE
   *
   * Sin contraseña, la API deja que cualquiera que la alcance apague el motor
   * de un vehículo. En 127.0.0.1 eso solo es esta máquina, y para desarrollar
   * es aceptable. Escuchando en cualquier otra interfaz, no lo es.
   *
   * El servidor se niega a arrancar en ese caso en vez de avisar y continuar:
   * un aviso en el log se pierde entre cien líneas, y el momento de descubrir
   * que la flota está expuesta no puede ser cuando ya lo está.
   */
  if (!protegido && !soloLocal) {
    app.log.error(
      [
        `API_HOST=${config.API_HOST} expone la API fuera de esta maquina, y no`,
        'hay contrasena configurada. Cualquiera podria apagar el motor de un',
        'vehiculo, borrar geocercas o generar enlaces de ubicacion.',
        '',
        'Genera una contrasena y ponla en tu .env:',
        '',
        '    pnpm hash-password',
        '',
        'El servidor no va a arrancar asi.',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!protegido) {
    app.log.warn(
      'La API no tiene contrasena. Solo escucha en 127.0.0.1, pero configura ' +
        'AUTH_PASSWORD_HASH antes de exponerla (pnpm hash-password).',
    );
  }

  // Cabeceras de seguridad. contentSecurityPolicy va apagado porque esto es
  // una API JSON: no sirve HTML, y una CSP aqui no protege de nada mientras
  // que si puede estorbar a las respuestas de error del navegador.
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(rateLimit, {
    // Generoso a proposito: el frontend consulta seguido y no queremos
    // estrangular el uso normal. Lo estricto va en /api/auth/login.
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(cookie, {
    // Sin secreto configurado se genera uno al vuelo. Consecuencia: las
    // sesiones no sobreviven un reinicio del servidor. Es lo correcto por
    // omision, porque la alternativa seria un secreto fijo en el codigo, que
    // es el mismo para todas las instalaciones del mundo.
    secret: config.AUTH_COOKIE_SECRET ?? randomBytes(32).toString('hex'),
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    // Hay que declarar los metodos EXPLICITAMENTE. Por omision @fastify/cors
    // solo anuncia GET, HEAD y POST en el preflight, asi que el navegador
    // bloquea PATCH, PUT y DELETE antes siquiera de enviarlos.
    //
    // El fallo es especialmente traicionero porque curl NO hace preflight: la
    // API responde 204 perfectamente desde la terminal mientras el navegador
    // no consigue borrar nada, y sin un error del lado del servidor.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  registerAuthRoutes(app);
  registerUnitRoutes(app, client, relay);
  registerFleetRoutes(app, client);
  registerMaintenanceRoutes(app, client);
  registerGeofenceRoutes(app, client);
  registerVehicleRoutes(app);
  registerCommandRoutes(app, client);
  registerHistoryRoutes(app, client);
  registerShareRoutes(app, client);

  /**
   * WebSocket propio hacia el navegador.
   *
   * El hook onRequest de la autenticacion tambien cubre esta ruta: el
   * handshake del WebSocket es una peticion HTTP normal, asi que una conexion
   * sin sesion se rechaza con 401 antes de llegar aqui. Sin eso, cualquiera
   * podria abrir el socket y ver las posiciones de toda la flota en vivo.
   */
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
  // EACCES en un puerto que nadie esta usando es desconcertante, y en Windows
  // es frecuente: Hyper-V se reserva rangos dinamicos que CAMBIAN al reiniciar,
  // y de pronto un puerto que funcionaba ayer deja de poder abrirse. Vale mucho
  // mas decir como comprobarlo que repetir el codigo de error.
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'EACCES'
  ) {
    app.log.error(
      [
        `El puerto ${String(config.API_PORT)} no se puede abrir (EACCES).`,
        '',
        'En Windows esto casi siempre es Hyper-V, que se reserva rangos de',
        'puertos y los cambia al reiniciar. Comprueba si el tuyo cayo dentro:',
        '',
        '    netsh int ipv4 show excludedportrange protocol=tcp',
        '',
        'Si aparece en la lista, cambia API_PORT en tu .env por uno fuera de',
        'esos rangos y actualiza tambien VITE_API_URL y VITE_WS_URL.',
      ].join('\n'),
    );
    process.exit(1);
  }

  app.log.error({ err: error }, 'No se pudo arrancar el servidor');
  process.exit(1);
});
