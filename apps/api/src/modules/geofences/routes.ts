/**
 * Geocercas y eventos.
 *
 * Las geocercas son de Traccar: él las evalúa y genera los eventos de entrada
 * y salida. Aquí solo se traducen entre su WKT (latitud primero) y GeoJSON, y
 * se resuelve el vínculo con las unidades. Ver ADR 0001.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TraccarClient } from '../../traccar/client.ts';
import type { FleetEvent } from '../../traccar/types.ts';
import { describirEvento, severidadDe } from '../events/describe.ts';
import { aWkt, circuloAPoligono, desdeWkt, WktError, type Geometria } from './wkt.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const puntoSchema = z.tuple([
  z.number().min(-180).max(180), // longitud
  z.number().min(-90).max(90), // latitud
]);

const geometriaSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('circulo'),
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
    // Un radio de 500 km ya no es una geocerca, es un error de captura.
    radio: z.number().positive().max(500_000),
  }),
  z.object({
    tipo: z.literal('poligono'),
    puntos: z.array(puntoSchema).min(3).max(500),
  }),
]);

const geocercaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  geometria: geometriaSchema,
  /** Unidades a las que aplica. Vacío = no genera ningún evento. */
  deviceIds: z.array(z.number().int().positive()).max(500).default([]),
});

export interface GeocercaExpuesta {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly geometria: Geometria;
  /** Anillo listo para dibujar, ya en orden GeoJSON. */
  readonly anillo: readonly (readonly [number, number])[];
  readonly deviceIds: readonly number[];
}

export function registerGeofenceRoutes(app: FastifyInstance, client: TraccarClient): void {
  // --------------------------------------------------------------------------
  //  Geocercas
  // --------------------------------------------------------------------------

  app.get('/api/geofences', async (request) => {
    const [geocercas, devices] = await Promise.all([
      client.getGeofences(),
      client.getDevices(),
    ]);

    // Traccar guarda el vínculo geocerca–unidad como permisos, y solo se puede
    // consultar por un lado a la vez. Con diez unidades son diez llamadas
    // baratas y en paralelo; con cientos habría que darle otra vuelta.
    const vinculos = await Promise.all(
      devices.map(async (d) => ({
        deviceId: d.id,
        geofenceIds: await client.getLinkedGeofenceIds(d.id),
      })),
    );

    const porGeocerca = new Map<number, number[]>();
    for (const v of vinculos) {
      for (const gid of v.geofenceIds) {
        const lista = porGeocerca.get(gid) ?? [];
        lista.push(v.deviceId);
        porGeocerca.set(gid, lista);
      }
    }

    const resultado: GeocercaExpuesta[] = [];
    for (const g of geocercas) {
      try {
        const geometria = desdeWkt(g.area);
        resultado.push({
          id: g.id,
          name: g.name,
          description: g.description ?? null,
          geometria,
          anillo:
            geometria.tipo === 'circulo' ? circuloAPoligono(geometria) : geometria.puntos,
          deviceIds: porGeocerca.get(g.id) ?? [],
        });
      } catch (error) {
        // Una geocerca con geometría que no entendemos (por ejemplo un
        // LINESTRING creado desde la interfaz de Traccar) no debe tumbar la
        // lista entera: se omite y se registra.
        const mensaje = error instanceof Error ? error.message : String(error);
        request.log.warn(
          { geofenceId: g.id, area: g.area, err: mensaje },
          'Geocerca con geometría no soportada, se omite',
        );
      }
    }

    return { geofences: resultado };
  });

  app.post('/api/geofences', async (request, reply) => {
    const datos = geocercaSchema.parse(request.body);

    let area: string;
    try {
      area = aWkt(datos.geometria);
    } catch (error) {
      if (error instanceof WktError) {
        void reply.status(400);
        return { error: error.message };
      }
      throw error;
    }

    const creada = await client.createGeofence({
      name: datos.name,
      description: datos.description,
      area,
    });

    // Sin el vínculo, la geocerca existe, se dibuja, y NO genera ni un evento.
    // Es la causa número uno de "la creé y no me avisa nada".
    for (const deviceId of datos.deviceIds) {
      await client.linkGeofence(deviceId, creada.id);
    }

    request.log.info(
      { geofenceId: creada.id, unidades: datos.deviceIds.length },
      'Geocerca creada',
    );
    void reply.status(201);
    return { id: creada.id };
  });

  /** Cambia el nombre, la descripción o las unidades vinculadas. */
  app.put('/api/geofences/:id', async (request) => {
    const { id } = idSchema.parse(request.params);
    const datos = geocercaSchema.parse(request.body);

    // Mismo motivo que en las unidades: el PUT de Traccar reemplaza el objeto
    // entero, así que se lee en crudo para no perder campos que no modelamos.
    const actual = await client.getRawGeofence(id);
    await client.updateGeofence(id, {
      ...actual,
      name: datos.name,
      description: datos.description ?? '',
      area: aWkt(datos.geometria),
    });

    // Sincronizar vínculos: agregar los nuevos, quitar los que ya no están.
    const devices = await client.getDevices();
    const deseados = new Set(datos.deviceIds);
    for (const d of devices) {
      const vinculadas = await client.getLinkedGeofenceIds(d.id);
      const estaVinculada = vinculadas.includes(id);
      if (deseados.has(d.id) && !estaVinculada) {
        await client.linkGeofence(d.id, id);
      } else if (!deseados.has(d.id) && estaVinculada) {
        await client.unlinkGeofence(d.id, id);
      }
    }

    request.log.info({ geofenceId: id }, 'Geocerca actualizada');
    return { id };
  });

  app.delete('/api/geofences/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    await client.deleteGeofence(id);
    request.log.info({ geofenceId: id }, 'Geocerca eliminada');
    void reply.status(204);
    return null;
  });

  // --------------------------------------------------------------------------
  //  Eventos
  // --------------------------------------------------------------------------

  const eventosQuerySchema = z.object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    deviceId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  });

  /**
   * Historial de eventos, ya traducidos.
   *
   * Por omisión, las últimas 24 horas: es el rango que responde "qué pasó
   * mientras no estaba mirando".
   */
  app.get('/api/events', async (request) => {
    const q = eventosQuerySchema.parse(request.query);
    const to = q.to ?? new Date().toISOString();
    const from = q.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [eventos, devices, geocercas] = await Promise.all([
      client.getEvents(from, to, { deviceId: q.deviceId }),
      client.getDevices(),
      client.getGeofences(),
    ]);

    const nombreUnidad = new Map(devices.map((d) => [d.id, d.name]));
    const nombreGeocerca = new Map(geocercas.map((g) => [g.id, g.name]));

    const resultado: FleetEvent[] = eventos
      .map((e) => ({
        id: e.id,
        type: e.type,
        eventTime: e.eventTime,
        deviceId: e.deviceId,
        deviceName: nombreUnidad.get(e.deviceId) ?? `Unidad ${String(e.deviceId)}`,
        geofenceId: e.geofenceId ?? null,
        message: describirEvento(e, {
          deviceName: nombreUnidad.get(e.deviceId) ?? `Unidad ${String(e.deviceId)}`,
          geofenceName:
            e.geofenceId == null ? undefined : nombreGeocerca.get(e.geofenceId),
        }),
        severity: severidadDe(e),
        attributes: e.attributes,
      }))
      // Traccar los devuelve del más viejo al más nuevo; para un historial
      // interesa al revés.
      .sort((a, b) => b.eventTime.localeCompare(a.eventTime))
      .slice(0, q.limit);

    return { events: resultado, from, to };
  });
}
