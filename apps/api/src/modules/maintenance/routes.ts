/**
 * Rutas del módulo de mantenimientos.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TraccarClient } from '../../traccar/client.ts';
import { toUnitPosition } from '../../traccar/mapper.ts';
import { compararUrgencia, evaluarRegla, type Lecturas } from './evaluate.ts';
import * as repo from './repo.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const intervalos = {
  intervalKm: z.number().positive().max(1_000_000).optional(),
  intervalDays: z.number().int().positive().max(3650).optional(),
  intervalEngineHours: z.number().positive().max(100_000).optional(),
  noticeKm: z.number().positive().max(100_000).optional(),
  noticeDays: z.number().int().positive().max(365).optional(),
  noticeEngineHours: z.number().positive().max(10_000).optional(),
};

const plantillaSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    ...intervalos,
  })
  .refine(
    (v) =>
      v.intervalKm !== undefined ||
      v.intervalDays !== undefined ||
      v.intervalEngineHours !== undefined,
    { message: 'Hay que configurar al menos un intervalo: kilómetros, días u horas de motor' },
  );

const aplicarSchema = z.object({
  deviceIds: z.array(z.number().int().positive()).min(1).max(500),
});

const servicioSchema = z.object({
  performedAt: z.iso.datetime({ offset: true }),
  odometerKm: z.number().nonnegative().optional(),
  engineHours: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  vendor: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Lecturas actuales de toda la flota, en una sola llamada a Traccar.
 *
 * El evaluador necesita el odómetro y las horas de motor de cada unidad. Pedir
 * la posición de cada una por separado sería el patrón N+1 que este proyecto
 * evita en todos lados; `/api/positions` sin parámetros ya devuelve la última
 * posición de todas.
 */
export async function leerFlota(
  client: TraccarClient,
): Promise<{
  lecturas: Map<number, Lecturas>;
  nombres: Map<number, { name: string; category: string | null }>;
}> {
  const [devices, positions] = await Promise.all([
    client.getDevices(),
    client.getLatestPositions(),
  ]);

  const lecturas = new Map<number, Lecturas>();
  for (const posicion of positions) {
    const p = toUnitPosition(posicion);
    lecturas.set(posicion.deviceId, {
      odometerKm: p.totalDistanceKm,
      engineHours: p.engineHours,
    });
  }

  const nombres = new Map(
    devices.map((d) => [d.id, { name: d.name, category: d.category ?? null }]),
  );

  // Una unidad sin ninguna posición todavía debe existir en el mapa de
  // lecturas, con valores nulos: si no, el evaluador no la vería.
  for (const device of devices) {
    if (!lecturas.has(device.id)) {
      lecturas.set(device.id, { odometerKm: null, engineHours: null });
    }
  }

  return { lecturas, nombres };
}

export function registerMaintenanceRoutes(app: FastifyInstance, client: TraccarClient): void {
  // --------------------------------------------------------------------------
  //  Plantillas
  // --------------------------------------------------------------------------

  app.get('/api/maintenance/templates', async () => ({
    templates: await repo.listarPlantillas(),
  }));

  app.post('/api/maintenance/templates', async (request, reply) => {
    const datos = plantillaSchema.parse(request.body);
    const id = await repo.crearPlantilla(datos);
    void reply.status(201);
    return { id };
  });

  app.delete('/api/maintenance/templates/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const borrada = await repo.borrarPlantilla(id);
    if (!borrada) {
      void reply.status(404);
      return { error: 'No existe esa plantilla' };
    }
    void reply.status(204);
    return null;
  });

  /**
   * Aplica una plantilla a varias unidades de golpe.
   *
   * Es la operación que hace usable el módulo con diez vehículos: definir
   * "aceite cada 5,000 km" una vez y soltarla sobre toda la flota, en vez de
   * capturarla diez veces.
   */
  app.post('/api/maintenance/templates/:id/apply', async (request) => {
    const { id } = idSchema.parse(request.params);
    const { deviceIds } = aplicarSchema.parse(request.body);

    const { lecturas } = await leerFlota(client);
    const resultado = await repo.aplicarPlantilla(id, deviceIds, lecturas);

    request.log.info({ templateId: id, ...resultado }, 'Plantilla aplicada');
    return resultado;
  });

  // --------------------------------------------------------------------------
  //  Reglas y su evaluación
  // --------------------------------------------------------------------------

  /**
   * Vista de flota: todas las reglas con su progreso, ordenadas por urgencia.
   * Es lo que alimenta la pantalla de mantenimientos.
   */
  app.get('/api/maintenance/overview', async (request) => {
    const query = z
      .object({ deviceId: z.coerce.number().int().positive().optional() })
      .parse(request.query);

    const [reglas, { lecturas, nombres }, ritmos] = await Promise.all([
      repo.listarReglas(query.deviceId),
      leerFlota(client),
      repo.calcularRitmos(),
    ]);

    const ahora = new Date();
    const evaluadas: repo.ReglaConEvaluacion[] = reglas.map((regla) => {
      const base = lecturas.get(regla.deviceId) ?? {
        odometerKm: null,
        engineHours: null,
      };
      // El ritmo de uso convierte "faltan 480 km" en "faltan 480 km, unos 6
      // días a su ritmo", que es lo que hace falta para agendar el taller.
      const ritmo = ritmos.get(regla.deviceId);
      const lectura = {
        ...base,
        kmPorDia: ritmo?.kmPorDia ?? null,
        horasPorDia: ritmo?.horasPorDia ?? null,
      };
      const info = nombres.get(regla.deviceId);
      return {
        ...evaluarRegla(regla, lectura, ahora),
        deviceName: info?.name ?? `Unidad ${String(regla.deviceId)}`,
        deviceCategory: info?.category ?? null,
        intervalKm: regla.intervalKm,
        intervalDays: regla.intervalDays,
        intervalEngineHours: regla.intervalEngineHours,
        baselineKm: regla.baselineKm,
        baselineAt: regla.baselineAtIso,
        templateId: regla.templateId,
        lastServiceAt: regla.lastServiceAt,
      };
    });

    evaluadas.sort(compararUrgencia);

    return {
      rules: evaluadas,
      summary: {
        total: evaluadas.length,
        overdue: evaluadas.filter((e) => e.nivel === 'overdue').length,
        dueSoon: evaluadas.filter((e) => e.nivel === 'due_soon').length,
        ok: evaluadas.filter((e) => e.nivel === 'ok').length,
      },
    };
  });

  app.delete('/api/maintenance/rules/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const borrada = await repo.borrarRegla(id);
    if (!borrada) {
      void reply.status(404);
      return { error: 'No existe esa regla activa' };
    }
    void reply.status(204);
    return null;
  });

  // --------------------------------------------------------------------------
  //  Servicios
  // --------------------------------------------------------------------------

  /** Registra un servicio realizado y reinicia el contador de esa regla. */
  app.post('/api/maintenance/rules/:id/complete', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const datos = servicioSchema.parse(request.body);

    const regla = await repo.obtenerRegla(id);
    if (regla === null) {
      void reply.status(404);
      return { error: 'No existe esa regla activa' };
    }

    const { lecturas } = await leerFlota(client);
    const lectura = lecturas.get(regla.deviceId) ?? { odometerKm: null, engineHours: null };

    const servicioId = await repo.registrarServicio(id, datos, lectura);
    request.log.info({ ruleId: id, servicioId }, 'Servicio registrado');
    void reply.status(201);
    return { id: servicioId };
  });

  app.get('/api/maintenance/history', async (request) => {
    const query = z
      .object({
        ruleId: z.coerce.number().int().positive().optional(),
        deviceId: z.coerce.number().int().positive().optional(),
      })
      .parse(request.query);
    return { services: await repo.listarServicios(query) };
  });

  // --------------------------------------------------------------------------
  //  Avisos
  // --------------------------------------------------------------------------

  app.get('/api/maintenance/alerts', async () => ({
    alerts: await repo.listarAvisosAbiertos(),
  }));
}
