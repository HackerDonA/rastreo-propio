/**
 * Centro de avisos: campana, panel de historial y notificaciones emergentes.
 *
 * Recibe los eventos por el mismo WebSocket que las posiciones. Los eventos NO
 * se agrupan como las posiciones: una posición nueva reemplaza a la anterior
 * sin perder nada, pero un evento perdido es un evento perdido.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

import {
  CLASES_SEVERIDAD,
  ETIQUETA_SEVERIDAD,
  obtenerEventos,
  type EventoFlota,
} from '../lib/flota-api.ts';

/** Cuántos eventos se conservan en memoria. Más allá, el historial es la API. */
const TOPE_MEMORIA = 300;
/** Segundos que dura un aviso emergente antes de desvanecerse. */
const DURACION_EMERGENTE_MS = 8_000;

function tiempoRelativo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${String(Math.floor(s / 60))} min`;
  if (s < 86400) return `hace ${String(Math.floor(s / 3600))} h`;
  return `hace ${String(Math.floor(s / 86400))} d`;
}

interface Props {
  /** Eventos que van llegando por el WebSocket. */
  readonly entrantes: readonly EventoFlota[];
  readonly onIrAUnidad: (deviceId: number) => void;
}

export function CentroAvisos({ entrantes, onIrAUnidad }: Props): JSX.Element {
  const [eventos, setEventos] = useState<readonly EventoFlota[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [sinLeer, setSinLeer] = useState(0);
  const [emergentes, setEmergentes] = useState<readonly EventoFlota[]>([]);
  // Se lee al inicializar y no en un efecto: es un valor que ya existe cuando
  // el componente monta, y leerlo en un efecto provoca un render extra.
  const [permisoNavegador, setPermisoNavegador] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const raizRef = useRef<HTMLDivElement | null>(null);
  const vistosRef = useRef(new Set<number>());

  // --- Historial inicial ----------------------------------------------------
  useEffect(() => {
    obtenerEventos(100)
      .then((datos) => {
        for (const e of datos) vistosRef.current.add(e.id);
        setEventos(datos);
      })
      .catch(() => {
        // Sin historial se sigue adelante: los eventos en vivo van a llegar
        // igual por el WebSocket.
      });
  }, []);

  // --- Eventos en vivo ------------------------------------------------------
  useEffect(() => {
    if (entrantes.length === 0) return;

    // Traccar puede reenviar un evento ya visto al reconectar el WebSocket.
    // Sin esta comprobación, una reconexión llenaría la pantalla de avisos
    // duplicados de cosas que ya pasaron.
    const nuevos = entrantes.filter((e) => !vistosRef.current.has(e.id));
    if (nuevos.length === 0) return;
    for (const e of nuevos) vistosRef.current.add(e.id);

    setEventos((previos) => [...nuevos, ...previos].slice(0, TOPE_MEMORIA));
    setSinLeer((n) => n + nuevos.length);

    // Solo interrumpen los que no son informativos. Si todo emergiera, en una
    // semana nadie miraría los avisos.
    const importantes = nuevos.filter((e) => e.severity !== 'info');
    if (importantes.length > 0) {
      setEmergentes((previos) => [...importantes, ...previos].slice(0, 4));
    }

    // Las alarmas además avisan aunque la pestaña esté en segundo plano: es la
    // diferencia entre enterarse de un botón de pánico o no.
    if (permisoNavegador === 'granted' && document.hidden) {
      for (const e of nuevos.filter((x) => x.severity === 'alarm')) {
        try {
          new Notification('Rastreo · alarma', { body: e.message, tag: String(e.id) });
        } catch {
          // Algunos navegadores exigen un Service Worker para esto. No es
          // motivo para romper nada: el aviso sigue en el panel.
        }
      }
    }
  }, [entrantes, permisoNavegador]);

  // --- Desvanecer los emergentes -------------------------------------------
  useEffect(() => {
    if (emergentes.length === 0) return;
    const t = setTimeout(() => {
      setEmergentes((previos) => previos.slice(0, -1));
    }, DURACION_EMERGENTE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [emergentes]);

  // --- Cerrar al hacer clic fuera ------------------------------------------
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent): void => {
      if (raizRef.current !== null && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', alClic);
    return () => {
      document.removeEventListener('mousedown', alClic);
    };
  }, [abierto]);

  const alternar = useCallback(() => {
    setAbierto((v) => {
      if (!v) setSinLeer(0);
      return !v;
    });
  }, []);

  const pedirPermiso = useCallback(() => {
    if (!('Notification' in window)) return;
    void Notification.requestPermission().then(setPermisoNavegador);
  }, []);

  const alarmasSinLeer = eventos.slice(0, sinLeer).some((e) => e.severity === 'alarm');

  return (
    <>
      {/* ---------- Campana ---------- */}
      <div ref={raizRef} className="relative">
        <button
          type="button"
          onClick={alternar}
          aria-label={`Avisos${sinLeer > 0 ? ` (${String(sinLeer)} sin leer)` : ''}`}
          aria-expanded={abierto}
          className="borde texto-suave relative rounded-lg border p-2 transition hover:bg-black/5 dark:hover:bg-white/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinejoin="round" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
          </svg>
          {sinLeer > 0 && (
            <span
              className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center
                          rounded-full px-1 text-[9px] font-bold text-white
                          ${alarmasSinLeer ? 'pulso bg-red-600' : 'bg-blue-600'}`}
            >
              {sinLeer > 99 ? '99+' : sinLeer}
            </span>
          )}
        </button>

        {/* ---------- Panel ---------- */}
        {abierto && (
          <div className="borde panel absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-2xl">
            <div className="borde flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">Avisos</span>
              <span className="texto-suave text-[11px]">{eventos.length} recientes</span>
            </div>

            {permisoNavegador !== 'granted' && 'Notification' in window && (
              <button
                type="button"
                onClick={pedirPermiso}
                className="borde w-full border-b bg-blue-500/8 px-3 py-2 text-left text-[11px] transition hover:bg-blue-500/15"
              >
                <span className="font-medium">Activar notificaciones del navegador</span>
                <span className="texto-suave block">
                  Para enterarte de una alarma aunque tengas la pestaña en segundo plano.
                </span>
              </button>
            )}

            <div className="scroll-fino max-h-96 overflow-y-auto">
              {eventos.length === 0 ? (
                <p className="texto-suave px-3 py-8 text-center text-sm">
                  Todavía no hay avisos.
                </p>
              ) : (
                eventos.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      onIrAUnidad(e.deviceId);
                      setAbierto(false);
                    }}
                    className="borde w-full border-b px-3 py-2 text-left transition last:border-b-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs leading-snug">{e.message}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold
                                    ring-1 ring-inset ${CLASES_SEVERIDAD[e.severity]}`}
                      >
                        {ETIQUETA_SEVERIDAD[e.severity]}
                      </span>
                    </div>
                    <span className="texto-suave mt-0.5 block text-[10px]">
                      {tiempoRelativo(e.eventTime)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------- Avisos emergentes ---------- */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {emergentes.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              onIrAUnidad(e.deviceId);
              setEmergentes((p) => p.filter((x) => x.id !== e.id));
            }}
            className={`borde panel pointer-events-auto w-72 rounded-lg border-l-4 p-3 text-left shadow-xl
                        ${e.severity === 'alarm' ? 'border-l-red-600' : 'border-l-amber-500'}`}
          >
            <div className="flex items-start gap-2">
              <span
                className={e.severity === 'alarm' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <path d="M12 9v4M12 16.5v.5" strokeLinecap="round" />
                  <path d="M10.3 3.9 2.4 17.4A2 2 0 0 0 4.1 20.4h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-snug font-medium">{e.message}</p>
                <p className="texto-suave mt-0.5 text-[10px]">Clic para ver la unidad</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
