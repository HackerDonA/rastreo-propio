/**
 * Historial: línea de tiempo del día y exportación del recorrido.
 *
 * Traccar ya detecta viajes y paradas; aquí se mezclan con los eventos en una
 * sola cronología, que es la forma en que uno recuerda un día: "salió a las 8,
 * estuvo parado en el cliente hasta las 9, se pasó de velocidad a las 9:40".
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TraccarClient } from '../../traccar/client.ts';
import { KNOTS_TO_KMH } from '../../traccar/types.ts';
import { describirEvento, severidadDe } from '../events/describe.ts';
import { exportar, nombreArchivo, TIPOS_MIME } from './exportar.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const rangoSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/** Un elemento de la cronología del día. */
export type ElementoLinea =
  | {
      readonly tipo: 'viaje';
      readonly inicio: string;
      readonly fin: string;
      readonly distanciaKm: number;
      readonly duracionMin: number;
      readonly velocidadMaxKmh: number;
      readonly velocidadMediaKmh: number;
      readonly desde: readonly [number, number];
      readonly hasta: readonly [number, number];
    }
  | {
      readonly tipo: 'parada';
      readonly inicio: string;
      readonly fin: string;
      readonly duracionMin: number;
      readonly posicion: readonly [number, number];
      readonly direccion: string | null;
    }
  | {
      readonly tipo: 'evento';
      readonly inicio: string;
      readonly mensaje: string;
      readonly severidad: 'info' | 'warning' | 'alarm';
      readonly evento: string;
    };

export function registerHistoryRoutes(app: FastifyInstance, client: TraccarClient): void {
  /**
   * Cronología del periodo: viajes, paradas y eventos, en orden.
   *
   * Las tres consultas van en paralelo porque son independientes; en serie
   * tardaría el triple para el mismo resultado.
   */
  app.get('/api/units/:id/timeline', async (request) => {
    const { id } = idSchema.parse(request.params);
    const { from, to } = rangoSchema.parse(request.query);

    const [viajes, paradas, eventos, devices, geocercas] = await Promise.all([
      client.getTrips(id, from, to),
      client.getStops(id, from, to),
      client.getEvents(from, to, { deviceId: id }),
      client.getDevices(),
      client.getGeofences(),
    ]);

    const nombreUnidad = devices.find((d) => d.id === id)?.name ?? `Unidad ${String(id)}`;
    const nombreGeocerca = new Map(geocercas.map((g) => [g.id, g.name]));

    const elementos: ElementoLinea[] = [
      ...viajes.map(
        (t): ElementoLinea => ({
          tipo: 'viaje',
          inicio: t.startTime,
          fin: t.endTime,
          distanciaKm: Math.round((t.distance / 1000) * 100) / 100,
          duracionMin: Math.round(t.duration / 60_000),
          velocidadMaxKmh: Math.round(t.maxSpeed * KNOTS_TO_KMH),
          velocidadMediaKmh: Math.round(t.averageSpeed * KNOTS_TO_KMH),
          desde: [t.startLon, t.startLat],
          hasta: [t.endLon, t.endLat],
        }),
      ),
      ...paradas.map(
        (s): ElementoLinea => ({
          tipo: 'parada',
          inicio: s.startTime,
          fin: s.endTime,
          duracionMin: Math.round(s.duration / 60_000),
          posicion: [s.longitude, s.latitude],
          direccion: s.address ?? null,
        }),
      ),
      ...eventos
        // Los de encendido y apagado se omiten: con un viaje ya listado
        // justo al lado, repiten la misma información y llenan la lista.
        .filter((e) => e.type !== 'ignitionOn' && e.type !== 'ignitionOff')
        .map(
          (e): ElementoLinea => ({
            tipo: 'evento',
            inicio: e.eventTime,
            mensaje: describirEvento(e, {
              deviceName: nombreUnidad,
              geofenceName:
                e.geofenceId == null ? undefined : nombreGeocerca.get(e.geofenceId),
            }),
            severidad: severidadDe(e),
            evento: e.type,
          }),
        ),
    ].sort((a, b) => a.inicio.localeCompare(b.inicio));

    const totalKm = viajes.reduce((acc, t) => acc + t.distance / 1000, 0);
    const totalMovimientoMin = viajes.reduce((acc, t) => acc + t.duration / 60_000, 0);
    const totalParadoMin = paradas.reduce((acc, s) => acc + s.duration / 60_000, 0);

    return {
      unitId: id,
      unitName: nombreUnidad,
      from,
      to,
      elementos,
      resumen: {
        viajes: viajes.length,
        paradas: paradas.length,
        distanciaKm: Math.round(totalKm * 10) / 10,
        minutosEnMovimiento: Math.round(totalMovimientoMin),
        minutosDetenido: Math.round(totalParadoMin),
        velocidadMaxKmh:
          viajes.length === 0
            ? 0
            : Math.round(Math.max(...viajes.map((t) => t.maxSpeed)) * KNOTS_TO_KMH),
      },
    };
  });

  /**
   * Descarga del recorrido.
   *
   * Se exporta el historial COMPLETO, sin simplificar: la simplificación existe
   * para que el navegador dibuje rápido, pero un archivo que se guarda para
   * análisis o para un seguro debe llevar todos los puntos.
   */
  app.get('/api/units/:id/export', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { from, to, formato } = rangoSchema
      .extend({ formato: z.enum(['csv', 'gpx', 'geojson']) })
      .parse(request.query);

    const [devices, historial] = await Promise.all([
      client.getDevices(),
      // maxPoints al tope: el endpoint de historial simplifica por omisión.
      app.inject({
        method: 'GET',
        url: `/api/units/${String(id)}/history`,
        query: { from, to, maxPoints: '20000' },
      }),
    ]);

    // El generico se anota en la VARIABLE y no en la llamada: `json<T>()`
    // sigue devolviendo `any` para el linter, y ese `any` se propagaria.
    const datos: {
      points: { latitude: number; longitude: number; speedKmh: number; course: number; fixTime: string }[];
    } = historial.json();
    const nombre = devices.find((d) => d.id === id)?.name ?? `Unidad ${String(id)}`;

    const contenido = exportar(formato, {
      unidad: nombre,
      desde: from,
      hasta: to,
      puntos: datos.points,
    });

    const archivo = nombreArchivo(nombre, from, formato);
    request.log.info({ deviceId: id, formato, puntos: datos.points.length }, 'Historial exportado');

    void reply
      .header('Content-Type', TIPOS_MIME[formato])
      // `attachment` hace que el navegador lo descargue en vez de mostrarlo.
      .header('Content-Disposition', `attachment; filename="${archivo}"`);
    return contenido;
  });
}
