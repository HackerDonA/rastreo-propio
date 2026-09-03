/**
 * Cliente HTTP del BFF.
 *
 * El frontend NUNCA habla con Traccar directamente: no conoce su URL ni su
 * token. Ver docs/adr/0002-bff-propio.md.
 */

import type { FleetSummary, Unit } from './tipos.ts';
import { resolverWsUrl } from './ws-url.ts';

/*
 * Direccion de la API.
 *
 * Vacia por omision, es decir: EL MISMO ORIGEN que la pagina. Las peticiones
 * salen como `/api/units`, y quien las lleva hasta la API es el proxy de Vite
 * en desarrollo y Caddy en produccion.
 *
 * Apuntar a otro host desde el navegador parece mas directo y rompe la sesion:
 * la cookie es `SameSite=Strict`, asi que el navegador la guarda pero no la
 * reenvia a un sitio distinto. Iniciar sesion responde 200, la peticion
 * siguiente 401, y la aplicacion vuelve sola a la pantalla de acceso sin decir
 * por que. Ver el comentario del proxy en vite.config.ts.
 *
 * Se exporta para que la pantalla de error muestre la URL real en vez de un
 * puerto escrito a mano, que es lo que se quedo desfasado cuando la API se
 * movio del 3000 al 4000.
 */
export const API_URL: string = import.meta.env['VITE_API_URL'] ?? '';

/**
 * Direccion del WebSocket.
 *
 * Se deriva de la pagina cuando no esta configurada, para que herede su host y
 * su esquema. Escribir `ws://` fijo funcionaria en desarrollo y fallaria en
 * produccion: sobre HTTPS el navegador bloquea un WebSocket sin cifrar.
 *
 * OJO CON `??` AQUI
 * -----------------
 * Una variable declarada como `VITE_WS_URL=` en el .env no llega como
 * `undefined`: llega como CADENA VACIA. Y `??` solo sustituye null o undefined,
 * asi que dejaba la URL en '' y `new WebSocket('')` falla al instante.
 *
 * El sintoma era desconcertante: la aplicacion cargaba, los datos se veian, y
 * solo el indicador de la barra decia "Sin conexion" para siempre. Todo lo que
 * va por HTTP seguia funcionando porque ahi la cadena vacia es justo lo que se
 * quiere: una URL relativa al mismo origen.
 */
const WS_URL: string = resolverWsUrl(
  import.meta.env['VITE_WS_URL'],
  window.location.protocol,
  window.location.host,
);

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
