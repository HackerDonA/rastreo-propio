/**
 * Vista agregada de la flota, para el tablero.
 */

import type { FastifyInstance } from 'fastify';

import { pool } from '../db.ts';
import type { TraccarClient } from '../traccar/client.ts';
import { buildUnits } from '../traccar/mapper.ts';
import type { FleetSummary } from '../traccar/types.ts';

interface DistanceRow {
  readonly km: string | null;
}

export function registerFleetRoutes(app: FastifyInstance, client: TraccarClient): void {
  app.get('/api/fleet/summary', async (): Promise<FleetSummary> => {
    const [devices, positions] = await Promise.all([
      client.getDevices(),
      client.getLatestPositions(),
    ]);

    const units = buildUnits(devices, positions);

    /*
     * Kilometros de hoy.
     *
     * Traccar acumula un odometro por unidad en attributes.totalDistance (en
     * metros). Los kilometros del dia son la diferencia entre el valor mas alto
     * y el mas bajo registrados desde la medianoche.
     *
     * Se usa `date_trunc('day', now())` del lado de PostgreSQL, y la sesion se
     * fija a la zona horaria local: si se calculara en UTC, "hoy" empezaria a
     * las 18:00 del dia anterior en horario del centro de Mexico.
     */
    const { rows } = await pool.query<DistanceRow>(
      `SELECT SUM(diff) AS km FROM (
         SELECT (MAX((attributes::json->>'totalDistance')::numeric)
               - MIN((attributes::json->>'totalDistance')::numeric)) / 1000 AS diff
           FROM tc_positions
          WHERE fixtime >= date_trunc('day', now())
            AND attributes::json->>'totalDistance' IS NOT NULL
          GROUP BY deviceid
       ) AS per_device`,
    );

    const distanceTodayKm = Number(rows[0]?.km ?? 0);

    const lastUpdate = units
      .map((u) => u.position?.fixTime)
      .filter((t): t is string => t !== undefined)
      .sort()
      .at(-1);

    return {
      totalUnits: units.length,
      moving: units.filter((u) => u.state === 'moving').length,
      stopped: units.filter((u) => u.state === 'stopped').length,
      offline: units.filter((u) => u.state === 'offline' || u.state === 'unknown').length,
      distanceTodayKm: Math.round(distanceTodayKm * 10) / 10,
      lastUpdate: lastUpdate ?? null,
    };
  });
}
