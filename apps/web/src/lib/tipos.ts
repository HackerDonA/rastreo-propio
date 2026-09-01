/**
 * Tipos que expone el BFF.
 *
 * Son un espejo de apps/api/src/traccar/types.ts. Se duplican a proposito en vez
 * de compartir un paquete: son dos artefactos que se despliegan por separado, y
 * el contrato entre ellos es la respuesta HTTP, no una importacion.
 *
 * Nota de unidades: el BFF ya convierte los nudos de Traccar a km/h. Aqui todo
 * llega en kilometros por hora y en kilometros.
 */

export type UnitState = 'moving' | 'stopped' | 'offline' | 'unknown';

export interface UnitPosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh: number;
  readonly course: number;
  readonly altitude: number;
  readonly fixTime: string;
  readonly serverTime: string;
  readonly address: string | null;
  readonly totalDistanceKm: number | null;
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
  readonly distanceTodayKm: number;
  readonly lastUpdate: string | null;
}

export type ServerMessage =
  | { readonly type: 'positions'; readonly units: readonly Unit[] }
  | { readonly type: 'events'; readonly events: readonly import('./flota-api.ts').EventoFlota[] }
  | { readonly type: 'upstream'; readonly connected: boolean };

// ----------------------------------------------------------------------------
//  Etiquetas y colores de estado
// ----------------------------------------------------------------------------

export const ETIQUETA_ESTADO: Readonly<Record<UnitState, string>> = {
  moving: 'En movimiento',
  stopped: 'Detenido',
  offline: 'Sin señal',
  unknown: 'Sin datos',
};

/**
 * Color por estado, en hexadecimal.
 *
 * Se necesitan como cadena literal porque MapLibre dibuja los marcadores sobre
 * un canvas y no puede leer variables CSS.
 */
export const COLOR_ESTADO: Readonly<Record<UnitState, string>> = {
  moving: '#16a34a',
  stopped: '#d97706',
  offline: '#64748b',
  unknown: '#64748b',
};

/** Clases de Tailwind para las insignias de estado. */
export const CLASES_ESTADO: Readonly<Record<UnitState, string>> = {
  moving: 'bg-green-500/12 text-green-700 dark:text-green-400 ring-green-500/25',
  stopped: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  offline: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 ring-slate-500/25',
  unknown: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 ring-slate-500/25',
};
