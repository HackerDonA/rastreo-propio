/**
 * Traduccion de los tipos de Traccar a los tipos que consume nuestro frontend.
 *
 * Aqui viven dos conversiones que, si se olvidan, producen errores silenciosos:
 *
 *   · velocidad: Traccar guarda NUDOS, el frontend muestra km/h
 *   · odometro:  Traccar acumula METROS en attributes.totalDistance
 *
 * Son funciones puras a proposito, para poder probarlas sin levantar nada.
 */

import {
  KNOTS_TO_KMH,
  MOVING_THRESHOLD_KMH,
  OFFLINE_AFTER_MINUTES,
  type TraccarDevice,
  type TraccarPosition,
  type Unit,
  type UnitPosition,
  type UnitState,
} from './types.ts';

/** Lee un atributo numerico de Traccar, que llega como `unknown`. */
function numberAttribute(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = attributes[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanAttribute(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
): boolean | null {
  const value = attributes[key];
  return typeof value === 'boolean' ? value : null;
}

export function toUnitPosition(position: TraccarPosition): UnitPosition {
  const totalDistanceM = numberAttribute(position.attributes, 'totalDistance');
  const hours = numberAttribute(position.attributes, 'hours');

  return {
    latitude: position.latitude,
    longitude: position.longitude,
    speedKmh: position.speed * KNOTS_TO_KMH,
    course: position.course,
    altitude: position.altitude,
    fixTime: position.fixTime,
    serverTime: position.serverTime,
    address: position.address ?? null,
    totalDistanceKm: totalDistanceM === null ? null : totalDistanceM / 1000,
    // Traccar acumula las horas de motor en MILISEGUNDOS.
    engineHours: hours === null ? null : hours / 3_600_000,
    ignition: booleanAttribute(position.attributes, 'ignition'),
    battery: numberAttribute(position.attributes, 'batteryLevel'),
  };
}

/**
 * Estado que se muestra en el panel lateral.
 *
 * No se usa `device.status` de Traccar a secas porque solo distingue
 * online/offline, y para quien mira la pantalla un vehiculo conectado pero
 * detenido y uno circulando son cosas distintas.
 *
 * `now` se recibe como parametro en vez de leer el reloj dentro, para que la
 * funcion sea determinista y se pueda probar.
 */
export function deriveState(
  device: TraccarDevice,
  position: UnitPosition | null,
  now: Date,
): UnitState {
  if (position === null) return 'unknown';

  const ageMinutes = (now.getTime() - new Date(position.fixTime).getTime()) / 60_000;
  if (!Number.isFinite(ageMinutes)) return 'unknown';
  if (ageMinutes > OFFLINE_AFTER_MINUTES) return 'offline';
  if (device.status === 'offline') return 'offline';

  return position.speedKmh >= MOVING_THRESHOLD_KMH ? 'moving' : 'stopped';
}

/**
 * Une la lista de unidades con la de ultimas posiciones.
 *
 * Recibe ambas listas completas y las cruza en memoria con un Map: dos llamadas
 * a Traccar en total, no una por unidad.
 */
export function buildUnits(
  devices: readonly TraccarDevice[],
  positions: readonly TraccarPosition[],
  now: Date = new Date(),
): Unit[] {
  const byDeviceId = new Map<number, TraccarPosition>();
  for (const position of positions) {
    const existing = byDeviceId.get(position.deviceId);
    // Si llegaran varias posiciones de la misma unidad, gana la mas reciente.
    if (existing === undefined || position.fixTime > existing.fixTime) {
      byDeviceId.set(position.deviceId, position);
    }
  }

  return devices.map((device) => {
    const raw = byDeviceId.get(device.id);
    const position = raw === undefined ? null : toUnitPosition(raw);
    return {
      id: device.id,
      name: device.name,
      uniqueId: device.uniqueId,
      category: device.category ?? null,
      model: device.model ?? null,
      state: deriveState(device, position, now),
      lastUpdate: device.lastUpdate ?? null,
      position,
    } satisfies Unit;
  });
}
