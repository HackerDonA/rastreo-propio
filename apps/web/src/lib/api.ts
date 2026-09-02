/**
 * Cliente HTTP del BFF.
 *
 * El frontend NUNCA habla con Traccar directamente: no conoce su URL ni su
 * token. Ver docs/adr/0002-bff-propio.md.
 */

import type { FleetSummary, Unit } from './tipos.ts';

/*
 * Direccion de la API.
 *
 * Va con 127.0.0.1 y NO con localhost, y no es lo mismo en Windows.
 *
 * `localhost` resuelve primero a ::1 (IPv6). El servidor de Vite escucha en
 * `::`, asi que la pagina carga por IPv6 sin problema; pero la API escucha en
 * 127.0.0.1, que es solo IPv4. El navegador intenta ::1:4000, no encuentra a
 * nadie, y la peticion falla antes de salir: se ve como "no se pudo contactar
 * a la API" con la API perfectamente encendida.
 *
 * Se exporta para que la pantalla de error pueda mostrar la URL real en vez de
 * un puerto escrito a mano, que es exactamente lo que se quedo desfasado
 * cuando la API se movio del 3000 al 4000.
 */
export const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://127.0.0.1:4000';
const WS_URL: string = import.meta.env['VITE_WS_URL'] ?? 'ws://127.0.0.1:4000/ws';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface OpcionesPeticion {
  // El `| undefined` explicito es necesario con exactOptionalPropertyTypes:
  // sin el, pasar `{ signal }` cuando signal viene sin valor no compila.
  readonly signal?: AbortSignal | undefined;
  readonly metodo?: 'GET' | 'PATCH' | undefined;
  readonly cuerpo?: unknown;
}

async function pedir<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { signal, metodo = 'GET', cuerpo } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      // La cookie de sesion viaja entre origenes distintos; sin esto no se manda.
      credentials: 'include',
      method: metodo,
      ...(signal === undefined ? {} : { signal }),
      ...(cuerpo === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }),
    });
  } catch (causa) {
    if (causa instanceof DOMException && causa.name === 'AbortError') throw causa;
    throw new ApiError('No se pudo contactar a la API. ¿Está corriendo `pnpm dev`?', 0);
  }

  if (!respuesta.ok) {
    // La API devuelve un mensaje util en el cuerpo; mostrarlo es mucho mejor
    // que un "error 400" a secas cuando el usuario acaba de escribir un nombre.
    let detalle = `La API respondió ${respuesta.status}`;
    try {
      const cuerpoError = (await respuesta.json()) as { error?: string; message?: string };
      detalle = cuerpoError.message ?? cuerpoError.error ?? detalle;
    } catch {
      // Respuesta sin JSON: se queda el mensaje genérico.
    }
    throw new ApiError(detalle, respuesta.status);
  }

  return (await respuesta.json()) as T;
}

export async function obtenerUnidades(signal?: AbortSignal): Promise<readonly Unit[]> {
  const datos = await pedir<{ units: readonly Unit[] }>('/api/units', { signal });
  return datos.units;
}

export async function obtenerResumenFlota(signal?: AbortSignal): Promise<FleetSummary> {
  return pedir<FleetSummary>('/api/fleet/summary', { signal });
}

/**
 * Cambia el nombre o el tipo de vehiculo de una unidad.
 *
 * El cambio se guarda en Traccar, no solo en el navegador: el nombre y la
 * categoria viven en su base de datos y se ven tambien en su interfaz nativa.
 */
export async function actualizarUnidad(
  id: number,
  cambios: { readonly name?: string; readonly category?: string },
): Promise<Unit> {
  const datos = await pedir<{ unit: Unit }>(`/api/units/${String(id)}`, {
    metodo: 'PATCH',
    cuerpo: cambios,
  });
  return datos.unit;
}

export const wsUrl = WS_URL;
