/**
 * Cliente HTTP de las funciones de flota: eventos, geocercas y fichas.
 *
 * Va aparte de `api.ts` (posiciones) y `mantenimientos.ts` para que cada
 * archivo siga siendo legible; todos hablan con el mismo BFF.
 */

const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000';

// ============================================================================
//  Tipos
// ============================================================================

export type Severidad = 'info' | 'warning' | 'alarm';

export interface EventoFlota {
  readonly id: number;
  readonly type: string;
  readonly eventTime: string;
  readonly deviceId: number;
  readonly deviceName: string;
  readonly geofenceId: number | null;
  readonly message: string;
  readonly severity: Severidad;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export type TipoGeometria = 'circulo' | 'poligono';

export type Geometria =
  | { readonly tipo: 'circulo'; readonly latitud: number; readonly longitud: number; readonly radio: number }
  | { readonly tipo: 'poligono'; readonly puntos: readonly (readonly [number, number])[] };

export interface Geocerca {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly geometria: Geometria;
  /** Anillo listo para dibujar, en orden GeoJSON [lon, lat]. */
  readonly anillo: readonly (readonly [number, number])[];
  readonly deviceIds: readonly number[];
}

export interface Ficha {
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

export type Riesgo = 'seguro' | 'cuidado' | 'peligroso';

export interface ComandoDisponible {
  readonly type: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly riesgo: Riesgo;
  readonly advertencia?: string;
}

export interface ComandosUnidad {
  readonly unitId: number;
  /** Por la conexión de datos: gratis, pero el equipo debe estar en línea. */
  readonly viaDatos: readonly ComandoDisponible[];
  /** Por SMS: funciona sin datos, pero cuesta un mensaje. */
  readonly viaSms: readonly ComandoDisponible[];
  readonly velocidadKmh: number | null;
  readonly enMovimiento: boolean;
  /** El protocolo del equipo no define comandos (caso OsmAnd). */
  readonly soloCustom: boolean;
}

export interface PuntoHistorial {
  readonly latitude: number;
  readonly longitude: number;
  readonly speedKmh: number;
  readonly course: number;
  readonly fixTime: string;
}

export interface Historial {
  readonly totalPoints: number;
  readonly returnedPoints: number;
  readonly distanceKm: number;
  readonly maxSpeedKmh: number;
  readonly points: readonly PuntoHistorial[];
}

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
      readonly severidad: Severidad;
      readonly evento: string;
    };

export interface LineaTiempo {
  readonly unitId: number;
  readonly unitName: string;
  readonly from: string;
  readonly to: string;
  readonly elementos: readonly ElementoLinea[];
  readonly resumen: {
    readonly viajes: number;
    readonly paradas: number;
    readonly distanciaKm: number;
    readonly minutosEnMovimiento: number;
    readonly minutosDetenido: number;
    readonly velocidadMaxKmh: number;
  };
}

export interface EnlaceCompartido {
  readonly token: string;
  readonly label: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly views: number;
  readonly lastViewedAt: string | null;
}

export type Formato = 'csv' | 'gpx' | 'geojson';

export interface DocumentoPorVencer {
  readonly deviceId: number;
  readonly plate: string | null;
  readonly kind: string;
  readonly expiresOn: string;
  readonly daysLeft: number;
}

// ============================================================================
//  Presentación
// ============================================================================

export const CLASES_SEVERIDAD: Readonly<Record<Severidad, string>> = {
  info: 'bg-blue-500/12 text-blue-700 dark:text-blue-400 ring-blue-500/25',
  warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  alarm: 'bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/25',
};

export const ETIQUETA_SEVERIDAD: Readonly<Record<Severidad, string>> = {
  info: 'Informativo',
  warning: 'Aviso',
  alarm: 'Alarma',
};

export const ETIQUETA_DOCUMENTO: Readonly<Record<string, string>> = {
  seguro: 'Seguro',
  verificacion: 'Verificación',
  tenencia: 'Tenencia',
};

// ============================================================================
//  Cliente
// ============================================================================

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${API_URL}${ruta}`, init);
  if (!respuesta.ok) {
    let detalle = `La API respondió ${String(respuesta.status)}`;
    try {
      const cuerpo = (await respuesta.json()) as {
        error?: string;
        message?: string;
        details?: readonly { campo: string; problema: string }[];
      };
      detalle =
        cuerpo.details?.map((d) => d.problema).join('. ') ??
        cuerpo.message ??
        cuerpo.error ??
        detalle;
    } catch {
      // Sin JSON en el cuerpo: se queda el mensaje genérico.
    }
    throw new Error(detalle);
  }
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

const json = (metodo: 'POST' | 'PUT', cuerpo: unknown): RequestInit => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

// --- Eventos ----------------------------------------------------------------

export async function obtenerEventos(limite = 100): Promise<readonly EventoFlota[]> {
  const d = await pedir<{ events: readonly EventoFlota[] }>(
    `/api/events?limit=${String(limite)}`,
  );
  return d.events;
}

// --- Geocercas --------------------------------------------------------------

export async function obtenerGeocercas(): Promise<readonly Geocerca[]> {
  const d = await pedir<{ geofences: readonly Geocerca[] }>('/api/geofences');
  return d.geofences;
}

export interface NuevaGeocerca {
  readonly name: string;
  readonly description?: string;
  readonly geometria: Geometria;
  readonly deviceIds: readonly number[];
}

export async function crearGeocerca(datos: NuevaGeocerca): Promise<number> {
  const d = await pedir<{ id: number }>('/api/geofences', json('POST', datos));
  return d.id;
}

export async function actualizarGeocerca(id: number, datos: NuevaGeocerca): Promise<void> {
  await pedir(`/api/geofences/${String(id)}`, json('PUT', datos));
}

export async function borrarGeocerca(id: number): Promise<void> {
  await pedir(`/api/geofences/${String(id)}`, { method: 'DELETE' });
}

// --- Fichas de vehículo -----------------------------------------------------

export async function obtenerFichas(): Promise<ReadonlyMap<number, Ficha>> {
  const d = await pedir<{ vehicles: readonly Ficha[] }>('/api/vehicles');
  return new Map(d.vehicles.map((v) => [v.deviceId, v]));
}

export type DatosFicha = Omit<Ficha, 'deviceId'>;

export async function guardarFicha(deviceId: number, datos: DatosFicha): Promise<Ficha> {
  const d = await pedir<{ vehicle: Ficha }>(
    `/api/vehicles/${String(deviceId)}`,
    json('PUT', datos),
  );
  return d.vehicle;
}

export async function obtenerPorVencer(dias = 60): Promise<readonly DocumentoPorVencer[]> {
  const d = await pedir<{ expiring: readonly DocumentoPorVencer[] }>(
    `/api/vehicles/expiring?days=${String(dias)}`,
  );
  return d.expiring;
}

// --- Comandos remotos -------------------------------------------------------

export async function obtenerComandos(deviceId: number): Promise<ComandosUnidad> {
  return pedir<ComandosUnidad>(`/api/units/${String(deviceId)}/commands`);
}

export async function enviarComando(
  deviceId: number,
  datos: {
    readonly type: string;
    readonly attributes: Record<string, string | number>;
    readonly textChannel: boolean;
    readonly confirmarEnMovimiento: boolean;
  },
): Promise<{ enviado: boolean; nota: string }> {
  return pedir(`/api/units/${String(deviceId)}/commands`, json('POST', datos));
}

// --- Historial --------------------------------------------------------------

export async function obtenerLineaTiempo(
  deviceId: number,
  from: string,
  to: string,
): Promise<LineaTiempo> {
  const q = new URLSearchParams({ from, to });
  return pedir(`/api/units/${String(deviceId)}/timeline?${q.toString()}`);
}

export async function obtenerHistorial(
  deviceId: number,
  from: string,
  to: string,
): Promise<Historial> {
  const q = new URLSearchParams({ from, to, maxPoints: '4000' });
  return pedir(`/api/units/${String(deviceId)}/history?${q.toString()}`);
}

/**
 * Descarga el recorrido como archivo.
 *
 * Se baja como blob y se dispara un enlace temporal en vez de abrir la URL
 * directamente: asi el navegador respeta el nombre de archivo que manda el
 * servidor y no navega fuera de la aplicacion.
 */
export async function descargarRecorrido(
  deviceId: number,
  from: string,
  to: string,
  formato: Formato,
): Promise<void> {
  const q = new URLSearchParams({ from, to, formato });
  const respuesta = await fetch(
    `${API_URL}/api/units/${String(deviceId)}/export?${q.toString()}`,
  );
  if (!respuesta.ok) throw new Error(`No se pudo generar el archivo (${String(respuesta.status)})`);

  // El nombre viene en Content-Disposition; si falta, uno razonable de reserva.
  const cabecera = respuesta.headers.get('Content-Disposition') ?? '';
  const coincidencia = /filename="([^"]+)"/.exec(cabecera);
  const nombre = coincidencia?.[1] ?? `recorrido.${formato}`;

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Sin revoke, el blob se queda en memoria hasta recargar la pagina.
  URL.revokeObjectURL(url);
}

// --- Compartir ubicacion ----------------------------------------------------

export async function obtenerEnlaces(deviceId: number): Promise<readonly EnlaceCompartido[]> {
  const d = await pedir<{ links: readonly EnlaceCompartido[] }>(
    `/api/units/${String(deviceId)}/share`,
  );
  return d.links;
}

export async function crearEnlace(
  deviceId: number,
  datos: { readonly label?: string; readonly horas: number },
): Promise<{ token: string; expiresAt: string }> {
  return pedir(`/api/units/${String(deviceId)}/share`, json('POST', datos));
}

export async function revocarEnlace(token: string): Promise<void> {
  await pedir(`/api/share/${token}`, { method: 'DELETE' });
}

/** URL completa que se le manda a la persona. */
export function urlCompartida(token: string): string {
  return `${window.location.origin}/c/${token}`;
}
