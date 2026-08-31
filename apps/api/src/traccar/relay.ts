/**
 * Relay del WebSocket de Traccar hacia los navegadores.
 *
 * Mantiene UNA sola conexion aguas arriba contra `/api/socket` de Traccar y
 * reparte a todos los clientes conectados. Con diez navegadores abiertos
 * hablando directo con Traccar habria diez conexiones; asi hay una.
 *
 * AGRUPAMIENTO: las posiciones que llegan no se reenvian de inmediato. Se
 * acumulan en un Map indexado por unidad y se vacian cada
 * WS_FLUSH_INTERVAL_MS. Con 10 unidades reportando cada segundo eso convierte
 * ~10 mensajes por segundo en ~1.3 por navegador, sin perder informacion: si
 * una unidad reporta dos veces dentro de la misma ventana, se manda la ultima,
 * que es la unica que el mapa necesita.
 *
 * Con 10 unidades la diferencia es comodidad; con 50 deja de serlo.
 */

import { WebSocket } from 'ws';

import { config } from '../config.ts';
import type { AppLogger } from '../lib/logger.ts';
import type { TraccarClient } from './client.ts';
import { buildUnits } from './mapper.ts';
import {
  traccarSocketMessageSchema,
  type ServerMessage,
  type TraccarDevice,
  type TraccarPosition,
  type Unit,
} from './types.ts';

/** Un cliente del navegador conectado a nuestro propio WebSocket. */
export interface RelayClient {
  send(data: string): void;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export class TraccarRelay {
  private upstream: WebSocket | null = null;
  private readonly clients = new Set<RelayClient>();

  /** Buffer de posiciones pendientes de emitir, la ultima por unidad. */
  private readonly pending = new Map<number, TraccarPosition>();
  private flushTimer: NodeJS.Timeout | null = null;

  /** Catalogo de unidades, para poder construir el objeto completo al emitir. */
  private devices = new Map<number, TraccarDevice>();

  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private connected = false;

  constructor(
    private readonly client: TraccarClient,
    private readonly logger: AppLogger,
  ) {}

  // --------------------------------------------------------------------------
  //  Clientes del navegador
  // --------------------------------------------------------------------------

  public addClient(client: RelayClient): void {
    this.clients.add(client);
    // Un cliente que acaba de conectar necesita saber si el enlace con Traccar
    // esta vivo, para no quedarse mirando un mapa que no se actualiza sin saber
    // por que.
    client.send(JSON.stringify({ type: 'upstream', connected: this.connected } satisfies ServerMessage));
    this.logger.debug({ clients: this.clients.size }, 'Cliente conectado al relay');
  }

  public removeClient(client: RelayClient): void {
    this.clients.delete(client);
    this.logger.debug({ clients: this.clients.size }, 'Cliente desconectado del relay');
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  /** Reemplaza el catalogo completo de unidades. */
  public setDevices(devices: readonly TraccarDevice[]): void {
    this.devices = new Map(devices.map((d) => [d.id, d]));
  }

  /**
   * Actualiza UNA unidad del catalogo sin tocar las demas.
   *
   * Existe aparte de `setDevices` a proposito: usar setDevices con un solo
   * elemento borraria el resto de la flota del catalogo, y los siguientes
   * mensajes del WebSocket saldrian sin las unidades desaparecidas.
   */
  public upsertDevice(device: TraccarDevice): void {
    this.devices.set(device.id, device);
  }

  // --------------------------------------------------------------------------
  //  Conexion aguas arriba
  // --------------------------------------------------------------------------

  public async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
    this.flushTimer = setInterval(() => {
      this.flush();
    }, config.WS_FLUSH_INTERVAL_MS);
  }

  public stop(): void {
    this.stopped = true;
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.upstream?.close();
    this.upstream = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    let cookie: string;
    try {
      // El token NO sirve para el WebSocket: hay que cambiarlo por una cookie.
      cookie = await this.client.openSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: message }, 'No se pudo abrir sesion en Traccar');
      this.scheduleReconnect();
      return;
    }

    const wsUrl = `${config.TRACCAR_URL.replace(/^http/, 'ws')}/api/socket`;
    const socket = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
    this.upstream = socket;

    socket.on('open', () => {
      this.connected = true;
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.logger.info('Conectado al WebSocket de Traccar');
      this.broadcast({ type: 'upstream', connected: true });
    });

    socket.on('message', (raw: Buffer) => {
      this.handleMessage(raw);
    });

    socket.on('close', (code: number) => {
      this.connected = false;
      this.upstream = null;
      if (!this.stopped) {
        this.logger.warn({ code }, 'WebSocket de Traccar cerrado, se reintentara');
        this.broadcast({ type: 'upstream', connected: false });
        this.scheduleReconnect();
      }
    });

    socket.on('error', (error: Error) => {
      this.logger.error({ err: error.message }, 'Error en el WebSocket de Traccar');
      // El evento 'close' viene despues y es quien programa la reconexion.
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const delay = this.backoffMs;
    this.logger.info({ delayMs: delay }, 'Reintentando conexion con Traccar');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    // Backoff exponencial con techo: si Traccar esta caido, no lo martillamos.
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private handleMessage(raw: Buffer): void {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      this.logger.warn('Mensaje del WebSocket de Traccar que no es JSON');
      return;
    }

    const parsed = traccarSocketMessageSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn('Mensaje del WebSocket de Traccar con forma inesperada');
      return;
    }

    // Traccar manda actualizaciones de unidad (cambios de estado) por el mismo
    // canal. Se aprovechan para mantener el catalogo fresco.
    for (const device of parsed.data.devices ?? []) {
      this.devices.set(device.id, device);
    }

    for (const position of parsed.data.positions ?? []) {
      this.pending.set(position.deviceId, position);
    }
  }

  /** Vacia el buffer hacia todos los navegadores conectados. */
  private flush(): void {
    if (this.pending.size === 0 || this.clients.size === 0) {
      // Si no hay nadie mirando, se descarta el buffer en vez de acumularlo.
      this.pending.clear();
      return;
    }

    const positions = [...this.pending.values()];
    this.pending.clear();

    const devices = positions
      .map((p) => this.devices.get(p.deviceId))
      .filter((d): d is TraccarDevice => d !== undefined);

    if (devices.length === 0) return;

    const units: Unit[] = buildUnits(devices, positions);
    this.broadcast({ type: 'positions', units });
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.send(payload);
      } catch {
        // Un cliente que ya se fue no debe tumbar la emision a los demas.
        this.clients.delete(client);
      }
    }
  }
}
