/**
 * Ficha administrativa de cada vehículo.
 *
 * Lo telemático (posiciones, viajes, odómetro acumulado) vive en Traccar. Lo
 * administrativo —placa, VIN, póliza, conductor, vencimientos— vive aquí,
 * porque Traccar no tiene dónde ponerlo salvo un JSON suelto de atributos.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../../db.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** `date` de PostgreSQL se maneja como cadena AAAA-MM-DD, sin hora ni zona. */
const fecha = z.iso.date().nullable().optional();
const texto = (max: number): z.ZodOptional<z.ZodNullable<z.ZodString>> =>
  z.string().trim().max(max).nullable().optional();

const vehiculoSchema = z.object({
  plate: texto(20),
  vin: texto(30),
  brand: texto(60),
  model: texto(60),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  color: texto(30),
  driverName: texto(120),
  driverPhone: texto(30),
  assignment: texto(120),
  odometerOffsetKm: z.number().nonnegative().max(10_000_000).nullable().optional(),
  insurancePolicy: texto(60),
  insuranceExpires: fecha,
  inspectionExpires: fecha,
  registrationExpires: fecha,
  notes: texto(2000),
});

export type DatosVehiculo = z.infer<typeof vehiculoSchema>;

export interface Vehiculo {
  readonly deviceId: number;
  readonly plate: string | null;
  readonly vin: string | null;
  readonly brand: string | null;
  readonly model: string | null;
  readonly year: number | null;
  readonly color: string | null;
  readonly driverName: string | null;
  readonly driverPhone: string | null;
  readonly assignment: string | null;
  readonly odometerOffsetKm: number | null;
  readonly insurancePolicy: string | null;
  readonly insuranceExpires: string | null;
  readonly inspectionExpires: string | null;
  readonly registrationExpires: string | null;
  readonly notes: string | null;
}

interface FilaVehiculo {
  device_id: number;
  plate: string | null;
  vin: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  assignment: string | null;
  odometer_offset_km: string | null;
  insurance_policy: string | null;
  insurance_expires: string | null;
  inspection_expires: string | null;
  registration_expires: string | null;
  notes: string | null;
}

/** Fechas: PostgreSQL `date` llega como Date de JS; se quiere AAAA-MM-DD. */
function aFecha(valor: string | Date | null): string | null {
  if (valor === null) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return valor.slice(0, 10);
}

function aVehiculo(f: FilaVehiculo): Vehiculo {
  return {
    deviceId: f.device_id,
    plate: f.plate,
    vin: f.vin,
    brand: f.brand,
    model: f.model,
    year: f.year,
    color: f.color,
    driverName: f.driver_name,
    driverPhone: f.driver_phone,
    assignment: f.assignment,
    odometerOffsetKm: f.odometer_offset_km === null ? null : Number(f.odometer_offset_km),
    insurancePolicy: f.insurance_policy,
    insuranceExpires: aFecha(f.insurance_expires),
    inspectionExpires: aFecha(f.inspection_expires),
    registrationExpires: aFecha(f.registration_expires),
    notes: f.notes,
  };
}

const COLUMNAS = `device_id, plate, vin, brand, model, year, color,
                  driver_name, driver_phone, assignment, odometer_offset_km,
                  insurance_policy, insurance_expires, inspection_expires,
                  registration_expires, notes`;

export function registerVehicleRoutes(app: FastifyInstance): void {
  /** Todas las fichas, indexadas por unidad para que el frontend las cruce. */
  app.get('/api/vehicles', async () => {
    const { rows } = await pool.query<FilaVehiculo>(
      `SELECT ${COLUMNAS} FROM app.vehicles ORDER BY device_id`,
    );
    return { vehicles: rows.map(aVehiculo) };
  });

  app.get('/api/vehicles/:id', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const { rows } = await pool.query<FilaVehiculo>(
      `SELECT ${COLUMNAS} FROM app.vehicles WHERE device_id = $1`,
      [id],
    );
    const fila = rows[0];
    if (fila === undefined) {
      // Una unidad sin ficha no es un error: simplemente no se ha capturado.
      // Se devuelve una ficha vacía para que el formulario del frontend no
      // tenga que distinguir entre "crear" y "editar".
      void reply.status(200);
      return { vehicle: null, deviceId: id };
    }
    return { vehicle: aVehiculo(fila) };
  });

  /**
   * Crea o actualiza la ficha de una unidad.
   *
   * Es un upsert por `device_id`: el frontend no necesita saber si la ficha ya
   * existía, que es justo lo que hace incómodos estos formularios.
   */
  app.put('/api/vehicles/:id', async (request) => {
    const { id } = idSchema.parse(request.params);
    const d = vehiculoSchema.parse(request.body);

    const { rows } = await pool.query<FilaVehiculo>(
      `INSERT INTO app.vehicles (
         device_id, plate, vin, brand, model, year, color,
         driver_name, driver_phone, assignment, odometer_offset_km,
         insurance_policy, insurance_expires, inspection_expires,
         registration_expires, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (device_id) DO UPDATE SET
         plate = EXCLUDED.plate,
         vin = EXCLUDED.vin,
         brand = EXCLUDED.brand,
         model = EXCLUDED.model,
         year = EXCLUDED.year,
         color = EXCLUDED.color,
         driver_name = EXCLUDED.driver_name,
         driver_phone = EXCLUDED.driver_phone,
         assignment = EXCLUDED.assignment,
         odometer_offset_km = EXCLUDED.odometer_offset_km,
         insurance_policy = EXCLUDED.insurance_policy,
         insurance_expires = EXCLUDED.insurance_expires,
         inspection_expires = EXCLUDED.inspection_expires,
         registration_expires = EXCLUDED.registration_expires,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING ${COLUMNAS}`,
      [
        id,
        d.plate ?? null,
        d.vin ?? null,
        d.brand ?? null,
        d.model ?? null,
        d.year ?? null,
        d.color ?? null,
        d.driverName ?? null,
        d.driverPhone ?? null,
        d.assignment ?? null,
        d.odometerOffsetKm ?? null,
        d.insurancePolicy ?? null,
        d.insuranceExpires ?? null,
        d.inspectionExpires ?? null,
        d.registrationExpires ?? null,
        d.notes ?? null,
      ],
    );

    const fila = rows[0];
    if (fila === undefined) throw new Error('No se pudo guardar la ficha del vehículo');
    request.log.info({ deviceId: id }, 'Ficha de vehículo guardada');
    return { vehicle: aVehiculo(fila) };
  });

  /**
   * Documentos por vencer.
   *
   * Alimenta el tablero. Se calcula en SQL y no en memoria porque son tres
   * columnas de fecha y la consulta cabe en una línea; traer todas las fichas
   * para filtrarlas en Node sería trabajo de más.
   */
  app.get('/api/vehicles/expiring', async (request) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(request.query);

    const { rows } = await pool.query<{
      device_id: number;
      plate: string | null;
      kind: string;
      expires_on: string | Date;
      days_left: string;
    }>(
      `SELECT device_id, plate, kind, expires_on,
              (expires_on - CURRENT_DATE) AS days_left
         FROM (
           SELECT device_id, plate, 'seguro' AS kind, insurance_expires AS expires_on
             FROM app.vehicles WHERE insurance_expires IS NOT NULL
           UNION ALL
           SELECT device_id, plate, 'verificacion', inspection_expires
             FROM app.vehicles WHERE inspection_expires IS NOT NULL
           UNION ALL
           SELECT device_id, plate, 'tenencia', registration_expires
             FROM app.vehicles WHERE registration_expires IS NOT NULL
         ) AS docs
        WHERE expires_on <= CURRENT_DATE + $1::int
        ORDER BY expires_on`,
      [days],
    );

    return {
      expiring: rows.map((r) => ({
        deviceId: r.device_id,
        plate: r.plate,
        kind: r.kind,
        expiresOn: aFecha(r.expires_on),
        daysLeft: Number(r.days_left),
      })),
    };
  });
}
