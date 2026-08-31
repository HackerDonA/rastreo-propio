/**
 * Rutas de unidades: flota, historial y viajes.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db.ts';
import { simplifyToBudget } from '../lib/simplify.ts';
import type { TraccarClient } from '../traccar/client.ts';
import { buildUnits } from '../traccar/mapper.ts';
import type { TraccarRelay } from '../traccar/relay.ts';
import {
  KNOTS_TO_KMH,
  type HistoryPoint,
  type HistoryResponse,
  type Unit,
} from '../traccar/types.ts';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const historyQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    /** Tope de puntos a devolver tras simplificar. */
    maxPoints: z.coerce.number().int().min(100).max(20_000).default(3_000),
  })
  .refine((v) => new Date(v.from) < new Date(v.to), {
    message: 'El parametro `from` debe ser anterior a `to`',
  });

const tripsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/**
 * Categorias de vehiculo permitidas.
 *
 * Se reutiliza el campo `category` de Traccar en vez de inventar un atributo
 * propio: ya existe, es texto libre pensado justo para agrupar unidades, y asi
 * la categoria tambien se ve bien en la interfaz nativa de Traccar.
 *
 * La lista es cerrada a proposito: el frontend dibuja un icono por categoria, y
 * un valor libre dejaria unidades sin icono.
 */
export const CATEGORIAS = [
  'car',
  'pickup',
  'truck',
  'van',
  'bus',
  'motorcycle',
  'tractor',
  'offroad',
  'default',
] as const;

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(80).optional(),
    category: z.enum(CATEGORIAS).optional(),
  })
  .refine((v) => v.name !== undefined || v.category !== undefined, {
    message: 'Hay que enviar al menos `name` o `category`',
  });

/** Fila cruda de tc_positions tal como la devuelve la consulta. */
interface PositionRow {
  readonly latitude: string | number;
  readonly longitude: string | number;
  readonly speed: string | number;
  readonly course: string | number;
  readonly fixtime: string;
}

const toNumber = (value: string | number): number =>
  typeof value === 'number' ? value : Number(value);

export function registerUnitRoutes(
  app: FastifyInstance,
  client: TraccarClient,
  relay: TraccarRelay,
): void {
  /**
   * Toda la flota con su ultima posicion y su estado.
   *
   * Dos llamadas a Traccar en total, no una por unidad: `/api/devices` y
   * `/api/positions` sin parametros (que devuelve la ultima posicion de todas).
   */
  app.get('/api/units', async (): Promise<{ units: Unit[] }> => {
    const [devices, positions] = await Promise.all([
      client.getDevices(),
      client.getLatestPositions(),
    ]);

    // Se aprovecha para mantener fresco el catalogo del relay, que lo necesita
    // para construir los mensajes del WebSocket.
    relay.setDevices(devices);

    return { units: buildUnits(devices, positions) };
  });

  /**
   * Renombra una unidad o le cambia el icono.
   *
   * Traccar no tiene PATCH: su PUT reemplaza el objeto entero. Por eso aqui se
   * lee la unidad CRUDA (sin validar, para no perder campos), se le encima el
   * cambio, y se manda de vuelta completa. Ver `getRawDevice` en el cliente.
   */
  app.patch('/api/units/:id', async (request): Promise<{ unit: Unit }> => {
    const { id } = paramsSchema.parse(request.params);
    const cambios = patchBodySchema.parse(request.body);

    const actual = await client.getRawDevice(id);
    const actualizado = await client.updateDevice(id, { ...actual, ...cambios });

    // Se devuelve la unidad completa, con su posicion, para que el frontend no
    // tenga que recargar toda la flota tras un cambio de nombre.
    const posiciones = await client.getLatestPositions();
    const [unit] = buildUnits([actualizado], posiciones);
    if (unit === undefined) {
      throw new Error('No se pudo reconstruir la unidad tras actualizarla');
    }

    relay.upsertDevice(actualizado);
    request.log.info({ id, cambios }, 'Unidad actualizada');
    return { unit };
  });

  /**
   * Historial de una unidad.
   *
   * Lee directo de tc_positions en vez de pasar por la API de Traccar por dos
   * motivos: Traccar corta en `report.maxPositions` (50 000 por omision), y aqui
   * podemos simplificar la ruta antes de serializar, que es lo que hace la
   * diferencia entre 8 MB de JSON y 200 KB.
   *
   * El indice `position_deviceid_fixtime` que Traccar ya crea es exactamente el
   * que necesita esta consulta.
   */
  app.get('/api/units/:id/history', async (request): Promise<HistoryResponse> => {
    const { id } = paramsSchema.parse(request.params);
    const { from, to, maxPoints } = historyQuerySchema.parse(request.query);

    const { rows } = await pool.query<PositionRow>(
      `SELECT latitude, longitude, speed, course, fixtime
         FROM tc_positions
        WHERE deviceid = $1
          AND fixtime >= $2
          AND fixtime <= $3
        ORDER BY fixtime ASC`,
      [id, from, to],
    );

    const points: HistoryPoint[] = rows.map((row) => ({
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      speedKmh: toNumber(row.speed) * KNOTS_TO_KMH,
      course: toNumber(row.course),
      fixTime: row.fixtime,
    }));

    // La distancia y la velocidad maxima se calculan sobre los puntos COMPLETOS,
    // antes de simplificar: simplificar acorta la linea, y si midieramos despues
    // los kilometros saldrian mas bajos de lo real.
    let distanceKm = 0;
    let maxSpeedKmh = 0;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (point === undefined) continue;
      if (point.speedKmh > maxSpeedKmh) maxSpeedKmh = point.speedKmh;
      const previous = points[i - 1];
      if (previous !== undefined) {
        distanceKm += haversineKm(previous, point);
      }
    }

    const simplified = simplifyToBudget(points, maxPoints);

    return {
      unitId: id,
      from,
      to,
      totalPoints: points.length,
      returnedPoints: simplified.length,
      distanceKm: Math.round(distanceKm * 100) / 100,
      maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
      points: simplified,
    };
  });

  /** Viajes detectados por Traccar. */
  app.get('/api/units/:id/trips', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { from, to } = tripsQuerySchema.parse(request.query);

    const trips = await client.getTrips(id, from, to);

    return {
      unitId: id,
      trips: trips.map((trip) => ({
        startTime: trip.startTime,
        endTime: trip.endTime,
        startLat: trip.startLat,
        startLon: trip.startLon,
        endLat: trip.endLat,
        endLon: trip.endLon,
        startAddress: trip.startAddress ?? null,
        endAddress: trip.endAddress ?? null,
        distanceKm: Math.round((trip.distance / 1000) * 100) / 100,
        durationMinutes: Math.round(trip.duration / 60_000),
        averageSpeedKmh: Math.round(trip.averageSpeed * KNOTS_TO_KMH * 10) / 10,
        maxSpeedKmh: Math.round(trip.maxSpeed * KNOTS_TO_KMH * 10) / 10,
      })),
    };
  });
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: HistoryPoint, b: HistoryPoint): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
