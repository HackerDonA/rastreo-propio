/**
 * Enlaces para compartir la ubicación de una unidad.
 *
 * Quien recibe el enlace ve dónde va el vehículo, y nada más. No necesita
 * cuenta, no puede mandar comandos, y no ve el resto de la flota.
 */

import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../../db.ts';
import type { TraccarClient } from '../../traccar/client.ts';
import { toUnitPosition } from '../../traccar/mapper.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });

const crearSchema = z.object({
  label: z.string().trim().max(80).optional(),
  /**
   * Cuántas horas dura. Máximo 30 días.
   *
   * No existe la opción "sin caducidad" a propósito: un enlace público y
   * permanente a la ubicación en vivo de un vehículo es una herramienta de
   * seguimiento de personas. Si hace falta más tiempo, se genera otro.
   */
  horas: z.number().int().min(1).max(720).default(24),
});

/**
 * Token de 32 bytes en base64url.
 *
 * `randomBytes` usa el generador criptográfico del sistema. `Math.random()`
 * NO sirve aquí: es predecible, y este token ES la credencial de acceso.
 */
function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

interface FilaEnlace {
  token: string;
  device_id: number;
  label: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
}

export function registerShareRoutes(app: FastifyInstance, client: TraccarClient): void {
  // --------------------------------------------------------------------------
  //  Gestión (privado)
  // --------------------------------------------------------------------------

  app.get('/api/units/:id/share', async (request) => {
    const { id } = idSchema.parse(request.params);
    const { rows } = await pool.query<FilaEnlace>(
      `SELECT * FROM app.share_links
        WHERE device_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC`,
      [id],
    );
    return {
      links: rows.map((r) => ({
        token: r.token,
        label: r.label,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        views: r.views,
        lastViewedAt: r.last_viewed_at,
      })),
    };
  });

  app.post('/api/units/:id/share', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const datos = crearSchema.parse(request.body);

    const token = generarToken();
    const { rows } = await pool.query<FilaEnlace>(
      `INSERT INTO app.share_links (token, device_id, label, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
       RETURNING *`,
      [token, id, datos.label ?? null, String(datos.horas)],
    );

    const fila = rows[0];
    if (fila === undefined) throw new Error('No se pudo crear el enlace');

    request.log.info({ deviceId: id, horas: datos.horas }, 'Enlace de ubicación creado');
    void reply.status(201);
    return { token: fila.token, expiresAt: fila.expires_at };
  });

  app.delete('/api/share/:token', async (request, reply) => {
    const { token } = tokenSchema.parse(request.params);
    const { rowCount } = await pool.query(
      'UPDATE app.share_links SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL',
      [token],
    );
    if ((rowCount ?? 0) === 0) {
      void reply.status(404);
      return { error: 'Ese enlace no existe o ya estaba revocado' };
    }
    request.log.info('Enlace de ubicación revocado');
    void reply.status(204);
    return null;
  });

  // --------------------------------------------------------------------------
  //  Consulta (PÚBLICO, sin autenticación)
  // --------------------------------------------------------------------------

  /**
   * Ubicación de la unidad compartida.
   *
   * ESTA RUTA ES PÚBLICA. Todo lo que devuelva es visible para cualquiera que
   * tenga el enlace, así que expone deliberadamente el mínimo:
   *
   *   · nombre y tipo de vehículo, para que se entienda qué se está viendo
   *   · posición, velocidad y rumbo
   *
   * NO expone el IMEI ni el identificador del equipo (permitiría suplantarlo
   * mandando posiciones falsas al puerto de protocolo), ni la placa, ni el
   * conductor, ni el resto de la flota, ni nada que permita mandar comandos.
   */
  app.get('/api/share/:token', async (request, reply) => {
    const { token } = tokenSchema.parse(request.params);

    const { rows } = await pool.query<FilaEnlace>(
      `SELECT * FROM app.share_links WHERE token = $1`,
      [token],
    );
    const enlace = rows[0];

    // Mismo mensaje para "no existe", "revocado" y "caducado". Distinguirlos
    // le diría a quien pruebe tokens al azar cuáles existieron alguna vez.
    const invalido =
      enlace === undefined ||
      enlace.revoked_at !== null ||
      new Date(enlace.expires_at).getTime() <= Date.now();

    if (invalido) {
      void reply.status(404);
      return { error: 'Este enlace no es válido o ya caducó' };
    }

    const [devices, posiciones] = await Promise.all([
      client.getDevices(),
      client.getLatestPositions(),
    ]);

    const device = devices.find((d) => d.id === enlace.device_id);
    if (device === undefined) {
      void reply.status(404);
      return { error: 'La unidad de este enlace ya no existe' };
    }

    const cruda = posiciones.find((p) => p.deviceId === enlace.device_id);
    const posicion = cruda === undefined ? null : toUnitPosition(cruda);

    // El contador se actualiza sin esperar: una escritura de auditoría no debe
    // retrasar la respuesta que ve la persona.
    void pool
      .query(
        'UPDATE app.share_links SET views = views + 1, last_viewed_at = now() WHERE token = $1',
        [token],
      )
      .catch(() => {
        // Si falla el contador, el enlace debe seguir funcionando igual.
      });

    return {
      nombre: device.name,
      categoria: device.category ?? null,
      expiraEl: enlace.expires_at,
      posicion:
        posicion === null
          ? null
          : {
              latitud: posicion.latitude,
              longitud: posicion.longitude,
              velocidadKmh: Math.round(posicion.speedKmh),
              rumbo: Math.round(posicion.course),
              actualizado: posicion.fixTime,
            },
    };
  });
}
