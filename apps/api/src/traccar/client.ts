/**
 * Cliente tipado de la API de Traccar.
 *
 * Traccar admite tres formas de autenticacion y NO son intercambiables:
 *
 *   · REST      -> encabezado `Authorization: Bearer <token>`
 *   · WebSocket -> UNICAMENTE cookie de sesion
 *
 * La documentacion oficial lo dice textual: "Session cookie is the only
 * authorization option for the WebSocket connection". Por eso este cliente
 * expone dos cosas: peticiones REST con Bearer, y `openSession()` que
 * intercambia el token por una cookie JSESSIONID para que el relay pueda abrir
 * el WebSocket. Ver docs/adr/0002-bff-propio.md.
 */

import { z } from 'zod';

import { config } from '../config.ts';
import type { AppLogger } from '../lib/logger.ts';
import {
  traccarDeviceSchema,
  traccarPositionSchema,
  traccarTripSchema,
  type TraccarDevice,
  type TraccarPosition,
} from './types.ts';

export class TraccarError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TraccarError';
  }
}

export class TraccarClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly logger: AppLogger,
    baseUrl: string = config.TRACCAR_URL,
    token: string = config.TRACCAR_API_TOKEN,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  /** Peticion REST autenticada con Bearer, validada contra un esquema Zod. */
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    searchParams?: Record<string, string>,
    init?: { method: 'PUT' | 'POST'; body: unknown },
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api${path}`);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(init === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(init === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new TraccarError(`No se pudo contactar a Traccar: ${message}`, 502);
    }

    if (!response.ok) {
      throw new TraccarError(
        `Traccar respondio ${response.status} en ${path}`,
        response.status === 401 ? 401 : 502,
      );
    }

    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.logger.error(
        { path, issues: parsed.error.issues.slice(0, 5) },
        'Traccar devolvio datos con una forma inesperada',
      );
      throw new TraccarError(`Respuesta inesperada de Traccar en ${path}`, 502);
    }
    return parsed.data;
  }

  /**
   * Intercambia el token de API por una cookie de sesion.
   *
   * Devuelve el valor completo del encabezado Cookie, listo para pasarselo al
   * WebSocket. Es la unica forma de autenticar `/api/socket`.
   */
  public async openSession(): Promise<string> {
    const url = new URL(`${this.baseUrl}/api/session`);
    url.searchParams.set('token', this.token);

    const response = await fetch(url, {
      // `manual` evita que fetch siga una redireccion y pierda el Set-Cookie.
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new TraccarError(
        `No se pudo abrir sesion en Traccar (HTTP ${response.status}). ` +
          'Lo mas probable es que TRACCAR_API_TOKEN sea invalido o haya expirado.',
        response.status === 401 ? 401 : 502,
      );
    }

    // getSetCookie() devuelve todas las cabeceras Set-Cookie por separado, que
    // es justo lo que hace falta: un split(',') las rompe, porque las fechas de
    // expiracion llevan comas.
    const cookies = response.headers.getSetCookie();
    const session = cookies
      .map((c) => c.split(';', 1)[0] ?? '')
      .find((c) => c.startsWith('JSESSIONID='));

    if (session === undefined) {
      throw new TraccarError(
        'Traccar acepto el token pero no devolvio la cookie JSESSIONID',
        502,
      );
    }

    return session;
  }

  /** Todas las unidades del usuario. */
  public async getDevices(): Promise<readonly TraccarDevice[]> {
    return this.request('/devices', z.array(traccarDeviceSchema));
  }

  /**
   * Ultima posicion conocida de TODAS las unidades, en una sola llamada.
   *
   * Sin parametros, `/api/positions` devuelve exactamente eso. Es lo que evita
   * el patron N+1 de pedir la posicion de cada unidad por separado.
   */
  public async getLatestPositions(): Promise<readonly TraccarPosition[]> {
    return this.request('/positions', z.array(traccarPositionSchema));
  }

  /**
   * Una unidad, SIN validar ni recortar campos.
   *
   * Es deliberado que no pase por Zod. `PUT /api/devices/{id}` de Traccar
   * reemplaza el objeto entero, no aplica un parche, y el Device real trae 15
   * campos: phone, contact, model, expirationTime, calendarId, groupId,
   * disabled... Si mandaramos de vuelta solo los campos que este proyecto
   * modela, Zod habria descartado el resto y el PUT los BORRARIA en silencio.
   *
   * Por eso `updateDevice` recibe el objeto crudo con las modificaciones
   * encima, y la validacion se aplica solo a la respuesta.
   */
  public async getRawDevice(id: number): Promise<Record<string, unknown>> {
    return this.request(`/devices/${id}`, z.record(z.string(), z.unknown()));
  }

  /** Reemplaza una unidad. `device` debe ser el objeto COMPLETO. */
  public async updateDevice(
    id: number,
    device: Record<string, unknown>,
  ): Promise<TraccarDevice> {
    return this.request(`/devices/${id}`, traccarDeviceSchema, undefined, {
      method: 'PUT',
      body: device,
    });
  }

  /** Viajes detectados por Traccar en un rango de fechas. */
  public async getTrips(
    deviceId: number,
    from: string,
    to: string,
  ): Promise<readonly z.infer<typeof traccarTripSchema>[]> {
    return this.request('/reports/trips', z.array(traccarTripSchema), {
      deviceId: String(deviceId),
      from,
      to,
    });
  }
}
