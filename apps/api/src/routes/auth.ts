/**
 * Inicio y cierre de sesión, y el guardia que protege todo lo demás.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { esRutaPublica, verificarContrasena } from '../auth.ts';
import { config } from '../config.ts';

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

/** Nombre de la cookie de sesión. */
const COOKIE = 'rastreo_sesion';

/** Duración de la sesión. Una semana: es una herramienta de trabajo diario. */
const DURACION_SEGUNDOS = 7 * 24 * 60 * 60;

export function registerAuthRoutes(app: FastifyInstance): void {
  const hash = config.AUTH_PASSWORD_HASH;
  const protegido = hash !== undefined && hash !== '';

  // --------------------------------------------------------------------------
  //  Guardia
  // --------------------------------------------------------------------------

  /**
   * Se ejecuta ANTES de cada petición.
   *
   * Protege por omisión: todo exige sesión salvo la lista corta y explícita de
   * `esRutaPublica`. Al revés —proteger ruta por ruta— basta olvidarse de una
   * para dejar un agujero, y con el tiempo siempre se olvida alguna.
   */
  app.addHook('onRequest', async (request, reply) => {
    if (!protegido) return;
    if (esRutaPublica(request.url.split('?')[0] ?? request.url)) return;

    // `signedCookies` solo trae las que superaron la verificación de firma:
    // una cookie manipulada llega como no firmada y no aparece aquí.
    const cookie = request.cookies[COOKIE];
    if (cookie === undefined) {
      void reply.status(401).send({ error: 'Sesión requerida' });
      return;
    }

    const desfirmada = request.unsignCookie(cookie);
    if (!desfirmada.valid) {
      void reply.status(401).send({ error: 'Sesión inválida' });
      return;
    }

    // El valor firmado es la marca de tiempo de creación; si es más vieja que
    // la duración, la sesión caducó aunque el navegador aún mande la cookie.
    const creada = Number(desfirmada.value);
    if (!Number.isFinite(creada) || Date.now() - creada > DURACION_SEGUNDOS * 1000) {
      void reply.status(401).send({ error: 'Sesión caducada' });
      return;
    }
  });

  // --------------------------------------------------------------------------
  //  Rutas
  // --------------------------------------------------------------------------

  /** Estado de la sesión. La usa el frontend para saber si mostrar el acceso. */
  app.get('/api/auth/estado', (request) => {
    if (!protegido) return { protegido: false, autenticado: true };
    const cookie = request.cookies[COOKIE];
    const valida =
      cookie !== undefined &&
      request.unsignCookie(cookie).valid &&
      Date.now() - Number(request.unsignCookie(cookie).value) <= DURACION_SEGUNDOS * 1000;
    return { protegido: true, autenticado: valida };
  });

  app.post(
    '/api/auth/login',
    {
      // Límite estricto y aparte del general: es la única puerta donde una
      // fuerza bruta tiene sentido, y scrypt ya la hace lenta por diseño.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!protegido) {
        return { ok: true, nota: 'La API no tiene contraseña configurada' };
      }

      const { password } = loginSchema.parse(request.body);
      const correcta = await verificarContrasena(password, hash);

      if (!correcta) {
        // Se registra el intento fallido con la IP: es lo que permite notar
        // que alguien está probando contraseñas.
        request.log.warn({ ip: request.ip }, 'Intento de acceso fallido');
        void reply.status(401);
        return { error: 'Contraseña incorrecta' };
      }

      void reply.setCookie(COOKIE, String(Date.now()), {
        // httpOnly: JavaScript no puede leerla, así que un XSS no se la lleva.
        httpOnly: true,
        // sameSite strict: el navegador no la manda en peticiones que vengan
        // de otro sitio, lo que corta los ataques CSRF de raíz.
        sameSite: 'strict',
        // secure solo en producción: en desarrollo se usa http://localhost y
        // el navegador rechazaría una cookie `secure`.
        secure: process.env['NODE_ENV'] === 'production',
        signed: true,
        path: '/',
        maxAge: DURACION_SEGUNDOS,
      });

      request.log.info({ ip: request.ip }, 'Sesión iniciada');
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', (_request, reply) => {
    void reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
}
