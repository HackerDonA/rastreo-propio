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
import { notificationSchema } from '../modules/events/bootstrap.ts';
import {
  traccarDeviceSchema,
  traccarEventSchema,
  traccarGeofenceSchema,
  traccarPositionSchema,
  traccarTripSchema,
  type TraccarDevice,
  type TraccarEvent,
  type TraccarGeofence,
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
   * Peticion que no devuelve cuerpo (DELETE, y los POST de /permissions).
   *
   * Va aparte de `request` porque Traccar responde 204 sin JSON, y llamar a
   * `.json()` sobre eso lanza. Separarlo evita un caso especial dentro del
   * camino normal.
   */
  private async requestNoContent(
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(new URL(`${this.baseUrl}/api${path}`), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new TraccarError(`No se pudo contactar a Traccar: ${message}`, 502);
    }

    if (!response.ok) {
      throw new TraccarError(
        `Traccar respondio ${response.status} en ${method} ${path}`,
        response.status === 401 ? 401 : 502,
      );
    }
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

  // --- Geocercas ------------------------------------------------------------
  //
  // Traccar ya implementa geocercas y genera los eventos de entrada y salida.
  // Reimplementarlas aqui seria repetir trabajo hecho y, peor, tener dos
  // definiciones de la misma zona que se pueden desincronizar.
  // Ver docs/adr/0001-motor-traccar.md.

  public async getGeofences(): Promise<readonly TraccarGeofence[]> {
    return this.request('/geofences', z.array(traccarGeofenceSchema));
  }

  public async createGeofence(datos: {
    name: string;
    description?: string | undefined;
    area: string;
  }): Promise<TraccarGeofence> {
    return this.request('/geofences', traccarGeofenceSchema, undefined, {
      method: 'POST',
      body: { name: datos.name, description: datos.description ?? '', area: datos.area },
    });
  }

  public async updateGeofence(
    id: number,
    geofence: Record<string, unknown>,
  ): Promise<TraccarGeofence> {
    return this.request(`/geofences/${String(id)}`, traccarGeofenceSchema, undefined, {
      method: 'PUT',
      body: geofence,
    });
  }

  public async getRawGeofence(id: number): Promise<Record<string, unknown>> {
    return this.request(`/geofences/${String(id)}`, z.record(z.string(), z.unknown()));
  }

  public async deleteGeofence(id: number): Promise<void> {
    await this.requestNoContent(`/geofences/${String(id)}`, 'DELETE');
  }

  /**
   * Vincula o desvincula una geocerca de una unidad.
   *
   * En Traccar las geocercas no se aplican solas: hay que crear un permiso que
   * une geofenceId con deviceId. Sin ese vinculo la geocerca existe, se dibuja
   * en el mapa, y NO genera ni un solo evento. Es la causa numero uno de
   * "cree la geocerca y no me avisa nada".
   */
  public async linkGeofence(deviceId: number, geofenceId: number): Promise<void> {
    await this.requestNoContent('/permissions', 'POST', { deviceId, geofenceId });
  }

  public async unlinkGeofence(deviceId: number, geofenceId: number): Promise<void> {
    await this.requestNoContent('/permissions', 'DELETE', { deviceId, geofenceId });
  }

  /**
   * Geocercas vinculadas a una unidad.
   *
   * `GET /api/permissions` exige exactamente dos parametros `*Id`, y admite 0
   * en un lado con el significado de "cualquiera". Asi que `deviceId=N` mas
   * `geofenceId=0` es "todas las geocercas de esta unidad".
   */
  public async getLinkedGeofenceIds(deviceId: number): Promise<number[]> {
    // OJO CON EL NOMBRE DEL CAMPO: este endpoint devuelve las columnas de la
    // base tal cual, en MINUSCULAS ({"deviceid":1,"geofenceid":1}), a
    // diferencia del resto de la API de Traccar, que usa camelCase. Esperar
    // `geofenceId` hace que Zod lo descarte y la geocerca aparezca sin
    // unidades vinculadas, sin ningun error.
    //
    // Se aceptan ambas grafias por si lo normalizan en una version futura.
    const permisos = await this.request(
      `/permissions?deviceId=${String(deviceId)}&geofenceId=0`,
      z.array(
        z.object({
          geofenceid: z.number().int().optional(),
          geofenceId: z.number().int().optional(),
        }),
      ),
    );
    return permisos
      .map((p) => p.geofenceid ?? p.geofenceId)
      .filter((id): id is number => id !== undefined);
  }

  // --- Notificaciones -------------------------------------------------------
  //
  // Traccar solo empuja eventos por el WebSocket si existe una Notification
  // con el canal 'web'. Ver modules/events/bootstrap.ts.

  public async getNotifications(): Promise<readonly z.infer<typeof notificationSchema>[]> {
    return this.request('/notifications', z.array(notificationSchema));
  }

  public async createNotification(datos: {
    type: string;
    always: boolean;
    notificators: string;
    description?: string;
    attributes?: Record<string, unknown>;
  }): Promise<z.infer<typeof notificationSchema>> {
    return this.request('/notifications', notificationSchema, undefined, {
      method: 'POST',
      body: datos,
    });
  }

  // --- Eventos --------------------------------------------------------------

  /** Eventos en un rango. `types` vacio significa todos. */
  public async getEvents(
    from: string,
    to: string,
    opciones: { deviceId?: number | undefined; types?: readonly string[] | undefined } = {},
  ): Promise<readonly TraccarEvent[]> {
    const params = new URLSearchParams({ from, to });
    if (opciones.deviceId !== undefined) params.set('deviceId', String(opciones.deviceId));
    // Traccar espera el parametro repetido, no una lista separada por comas.
    for (const t of opciones.types ?? []) params.append('type', t);
    // Sin ningun tipo, Traccar devuelve vacio en vez de todo; 'allEvents' es
    // su comodin documentado.
    if ((opciones.types ?? []).length === 0) params.append('type', 'allEvents');

    return this.request(
      `/reports/events?${params.toString()}`,
      z.array(traccarEventSchema),
    );
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
