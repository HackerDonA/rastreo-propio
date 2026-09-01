/**
 * Estado de la flota: carga inicial por HTTP y actualizaciones por WebSocket.
 *
 * El WebSocket manda solo las unidades que cambiaron, no la flota entera. Aqui
 * se fusionan sobre el estado existente, para no perder las que no se movieron.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { obtenerUnidades, wsUrl } from './api.ts';
import type { ServerMessage, Unit } from './tipos.ts';

export type EstadoCarga = 'cargando' | 'listo' | 'error';

export interface EstadoFlota {
  readonly unidades: readonly Unit[];
  readonly carga: EstadoCarga;
  readonly error: string | null;
  /** Si el BFF tiene viva su conexion con Traccar. */
  readonly enVivo: boolean;
  /** Momento de la ultima actualizacion recibida. */
  readonly ultimoMensaje: Date | null;
  readonly recargar: () => void;
  /** Aplica en local una unidad ya guardada en el servidor. */
  readonly aplicarUnidad: (unidad: Unit) => void;
}

const REINTENTO_BASE_MS = 1_000;
const REINTENTO_MAX_MS = 15_000;

export function useFlota(): EstadoFlota {
  const [unidades, setUnidades] = useState<readonly Unit[]>([]);
  const [carga, setCarga] = useState<EstadoCarga>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [enVivo, setEnVivo] = useState(false);
  const [ultimoMensaje, setUltimoMensaje] = useState<Date | null>(null);

  const [intento, setIntento] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  const recargar = useCallback(() => {
    // El estado de carga se marca AQUI, en el manejador, y no dentro del
    // efecto. Llamar a setState de forma sincrona en el cuerpo de un efecto
    // provoca un render en cascada (regla react-hooks/set-state-in-effect).
    setCarga('cargando');
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  /**
   * Refleja de inmediato un cambio ya confirmado por el servidor (renombrar,
   * cambiar icono) sin esperar al siguiente mensaje del WebSocket, que solo
   * llega cuando la unidad reporta una posicion nueva. Sin esto, renombrar un
   * vehiculo detenido no se veria hasta que volviera a moverse.
   */
  const aplicarUnidad = useCallback((unidad: Unit) => {
    setUnidades((previas) => previas.map((u) => (u.id === unidad.id ? unidad : u)));
  }, []);

  // --- Carga inicial --------------------------------------------------------
  useEffect(() => {
    const controlador = new AbortController();

    obtenerUnidades(controlador.signal)
      .then((datos) => {
        setUnidades(datos);
        setCarga('listo');
      })
      .catch((causa: unknown) => {
        if (causa instanceof DOMException && causa.name === 'AbortError') return;
        setError(causa instanceof Error ? causa.message : 'Error desconocido');
        setCarga('error');
      });

    return () => {
      controlador.abort();
    };
  }, [intento]);

  // --- Actualizaciones en vivo ---------------------------------------------
  useEffect(() => {
    let cerrado = false;
    let reintentoMs = REINTENTO_BASE_MS;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const conectar = (): void => {
      if (cerrado) return;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        reintentoMs = REINTENTO_BASE_MS;
      };

      socket.onmessage = (evento: MessageEvent<string>) => {
        let mensaje: ServerMessage;
        try {
          mensaje = JSON.parse(evento.data) as ServerMessage;
        } catch {
          return;
        }

        if (mensaje.type === 'upstream') {
          setEnVivo(mensaje.connected);
          return;
        }

        setUltimoMensaje(new Date());
        // Fusion: se reemplazan las unidades que llegaron y se conservan las
        // demas. El mensaje trae solo las que se movieron en la ultima ventana.
        setUnidades((previas) => {
          const porId = new Map(previas.map((u) => [u.id, u]));
          for (const unidad of mensaje.units) porId.set(unidad.id, unidad);
          return [...porId.values()];
        });
      };

      socket.onclose = () => {
        setEnVivo(false);
        socketRef.current = null;
        if (cerrado) return;
        temporizador = setTimeout(conectar, reintentoMs);
        reintentoMs = Math.min(reintentoMs * 2, REINTENTO_MAX_MS);
      };

      socket.onerror = () => {
        // El evento `close` viene despues y es quien programa el reintento.
        socket.close();
      };
    };

    conectar();

    return () => {
      cerrado = true;
      if (temporizador !== undefined) clearTimeout(temporizador);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { unidades, carga, error, enVivo, ultimoMensaje, recargar, aplicarUnidad };
}
