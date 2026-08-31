/**
 * Cliente HTTP del BFF.
 *
 * El frontend NUNCA habla con Traccar directamente: no conoce su URL ni su
 * token. Ver docs/adr/0002-bff-propio.md.
 */

import type { FleetSummary, Unit } from './tipos.ts';

const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';
const WS_URL: string = import.meta.env['VITE_WS_URL'] ?? 'ws://localhost:3000/ws';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function pedir<T>(ruta: string, signal?: AbortSignal): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, signal === undefined ? {} : { signal });
  } catch (causa) {
    if (causa instanceof DOMException && causa.name === 'AbortError') throw causa;
    throw new ApiError(
      'No se pudo contactar a la API. ¿Está corriendo `pnpm dev`?',
      0,
    );
  }

  if (!respuesta.ok) {
    throw new ApiError(`La API respondió ${respuesta.status}`, respuesta.status);
  }

  return (await respuesta.json()) as T;
}

export async function obtenerUnidades(signal?: AbortSignal): Promise<readonly Unit[]> {
  const datos = await pedir<{ units: readonly Unit[] }>('/api/units', signal);
  return datos.units;
}

export async function obtenerResumenFlota(signal?: AbortSignal): Promise<FleetSummary> {
  return pedir<FleetSummary>('/api/fleet/summary', signal);
}

export const wsUrl = WS_URL;
