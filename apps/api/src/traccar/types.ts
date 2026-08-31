/**
 * Tipos de la API de Traccar, y los tipos propios que expone nuestro BFF.
 *
 * Los de Traccar estan recortados a los campos que realmente usamos: replicar
 * su esquema completo seria trabajo de mantenimiento sin beneficio. Se validan
 * con Zod en la frontera, porque son datos de un sistema externo.
 */

import { z } from 'zod';

// ============================================================================
//  Lo que devuelve Traccar
// ============================================================================

export const traccarDeviceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  uniqueId: z.string(),
  /** 'online' | 'offline' | 'unknown' */
  status: z.string(),
  disabled: z.boolean().optional(),
  lastUpdate: z.string().nullable().optional(),
  positionId: z.number().int().nullable().optional(),
  groupId: z.number().int().nullable().optional(),
  model: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export type TraccarDevice = z.infer<typeof traccarDeviceSchema>;

export const traccarPositionSchema = z.object({
  id: z.number().int(),
  deviceId: z.number().int(),
  protocol: z.string().optional(),
  deviceTime: z.string(),
  fixTime: z.string(),
  serverTime: z.string(),
  valid: z.boolean(),
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number(),
  /** OJO: Traccar guarda la velocidad en NUDOS. */
  speed: z.number(),
  course: z.number(),
  address: z.string().nullable().optional(),
  accuracy: z.number().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export type TraccarPosition = z.infer<typeof traccarPositionSchema>;

/** Mensaje del WebSocket de Traccar. Los tres campos son opcionales. */
export const traccarSocketMessageSchema = z.object({
  devices: z.array(traccarDeviceSchema).optional(),
  positions: z.array(traccarPositionSchema).optional(),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const traccarTripSchema = z.object({
  deviceId: z.number().int(),
  deviceName: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  startLat: z.number(),
  startLon: z.number(),
  endLat: z.number(),
  endLon: z.number(),
  startAddress: z.string().nullable().optional(),
  endAddress: z.string().nullable().optional(),
  /** Metros. */
  distance: z.number(),
  /** Nudos. */
  averageSpeed: z.number(),
  maxSpeed: z.number(),
  /** Milisegundos. */
  duration: z.number(),
});

// ============================================================================
//  Lo que expone nuestro BFF
// ============================================================================

/**
 * Estado derivado de una unidad, pensado para el filtro del panel lateral.
 *
 * Traccar solo distingue online/offline/unknown, que no basta: un vehiculo
 * conectado pero detenido y uno conectado y circulando son casos muy distintos
 * para quien mira la pantalla.
 */
export type UnitState = 'moving' | 'stopped' | 'offline' | 'unknown';

export const KNOTS_TO_KMH = 1.852;

/** Velocidad (en km/h) a partir de la cual se considera que la unidad se mueve. */
export const MOVING_THRESHOLD_KMH = 3;

/** Minutos sin reportar tras los cuales una unidad se considera sin senal. */
export const OFFLINE_AFTER_MINUTES = 10;

export interface UnitPosition {
  readonly latitude: number;
  readonly longitude: number;
  /** Convertida a km/h para que el frontend no tenga que saber de nudos. */
  readonly speedKmh: number;
  readonly course: number;
  readonly altitude: number;
  readonly fixTime: string;
  readonly serverTime: string;
  readonly address: string | null;
  /** Odometro acumulado por Traccar, en kilometros. */
  readonly totalDistanceKm: number | null;
  /** Horas de motor acumuladas por Traccar. */
  readonly engineHours: number | null;
  readonly ignition: boolean | null;
  readonly battery: number | null;
}

export interface Unit {
  readonly id: number;
  readonly name: string;
  readonly uniqueId: string;
  readonly category: string | null;
  readonly model: string | null;
  readonly state: UnitState;
  readonly lastUpdate: string | null;
  readonly position: UnitPosition | null;
}

export interface FleetSummary {
  readonly totalUnits: number;
  readonly moving: number;
  readonly stopped: number;
  readonly offline: number;
  /** Kilometros recorridos hoy por toda la flota. */
  readonly distanceTodayKm: number;
  readonly lastUpdate: string | null;
}

export interface HistoryPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh: number;
  readonly course: number;
  readonly fixTime: string;
}

export interface HistoryResponse {
  readonly unitId: number;
  readonly from: string;
  readonly to: string;
  /** Puntos que realmente existen en la base para ese rango. */
  readonly totalPoints: number;
  /** Puntos devueltos tras simplificar la ruta. */
  readonly returnedPoints: number;
  readonly distanceKm: number;
  readonly maxSpeedKmh: number;
  readonly points: readonly HistoryPoint[];
}

/** Mensaje que el BFF manda a los navegadores por su propio WebSocket. */
export type ServerMessage =
  | { readonly type: 'positions'; readonly units: readonly Unit[] }
  | { readonly type: 'upstream'; readonly connected: boolean };
