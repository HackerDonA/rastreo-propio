/**
 * Crear y administrar enlaces de ubicación de una unidad.
 *
 * Quien recibe el enlace ve dónde va el vehículo y nada más: ni el IMEI, ni la
 * placa, ni el conductor, ni el resto de la flota.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  crearEnlace,
  obtenerEnlaces,
  revocarEnlace,
  urlCompartida,
  type EnlaceCompartido,
} from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';

/**
 * Duraciones ofrecidas.
 *
 * No hay opción "para siempre" a propósito: un enlace público y permanente a la
 * ubicación en vivo de un vehículo es una herramienta de seguimiento de
 * personas. Si hace falta más tiempo, se genera otro.
 */
const DURACIONES = [
  { horas: 2, etiqueta: '2 horas', nota: 'una entrega' },
  { horas: 8, etiqueta: '8 horas', nota: 'una jornada' },
  { horas: 24, etiqueta: '1 día', nota: '' },
  { horas: 168, etiqueta: '1 semana', nota: '' },
] as const;

function restante(iso: string): string {
  const horas = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (horas <= 0) return 'caducado';
  if (horas < 1) return `${String(Math.round(horas * 60))} min`;
  if (horas < 48) return `${String(Math.round(horas))} h`;
  return `${String(Math.round(horas / 24))} días`;
}

interface Props {
  readonly unidad: Unit;
  readonly onCerrar: () => void;
}

export function PanelCompartir({ unidad, onCerrar }: Props): JSX.Element {
  const [enlaces, setEnlaces] = useState<readonly EnlaceCompartido[]>([]);
  const [horas, setHoras] = useState<number>(8);
  const [etiqueta, setEtiqueta] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const recargar = useCallback(async (): Promise<void> => {
    try {
      setEnlaces(await obtenerEnlaces(unidad.id));
      setError(null);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudieron cargar');
    }
  }, [unidad.id]);

  useEffect(() => {
    // `recargar` es asincrona: sus setState ocurren despues del primer await,
    // asi que no hay render en cascada. La regla no puede distinguirlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar();
  }, [recargar]);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
    };
  }, [onCerrar]);

  const copiar = async (token: string): Promise<void> => {
    const url = urlCompartida(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(token);
      setTimeout(() => {
        setCopiado(null);
      }, 2000);
    } catch {
      // El portapapeles falla en contextos no seguros (http sin localhost).
      // Se muestra la URL para que se pueda copiar a mano en vez de fingir
      // que funcionó.
      setError(`Copia el enlace manualmente: ${url}`);
    }
  };

  const crear = async (): Promise<void> => {
    setCreando(true);
    setError(null);
    try {
      const r = await crearEnlace(unidad.id, {
        ...(etiqueta.trim() === '' ? {} : { label: etiqueta.trim() }),
        horas,
      });
      setEtiqueta('');
      await recargar();
      await copiar(r.token);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo crear el enlace');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="borde panel scroll-fino aparecer max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border p-5 sombra-alta">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">Compartir ubicación</h3>
            <p className="texto-suave truncate text-xs">{unidad.name}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="texto-suave rounded p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="texto-suave mb-3 text-xs">
          Genera un enlace para que alguien vea dónde va este vehículo, sin cuenta y sin
          acceso a nada más. No verá el IMEI, ni la placa, ni el conductor, ni las demás
          unidades.
        </p>

        {/* ---------- Crear ---------- */}
        <div className="borde mb-4 rounded-lg border p-3">
          <label className="texto-suave mb-1 block text-xs font-medium" htmlFor="sh-etiq">
            ¿Para quién? (opcional)
          </label>
          <input
            id="sh-etiq"
            value={etiqueta}
            onChange={(e) => {
              setEtiqueta(e.target.value);
            }}
            placeholder="Cliente Pérez"
            className="borde panel mb-2 w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />

          <p className="texto-suave mb-1 text-xs font-medium">Caduca en</p>
          <div className="mb-2 grid grid-cols-4 gap-1">
            {DURACIONES.map((d) => (
              <button
                key={d.horas}
                type="button"
                onClick={() => {
                  setHoras(d.horas);
                }}
                aria-pressed={horas === d.horas}
                title={d.nota}
                className={`rounded-lg px-1 py-1.5 text-[11px] font-medium transition ${
                  horas === d.horas
                    ? 'bg-indigo-600 text-white'
                    : 'borde texto-suave border hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {d.etiqueta}
              </button>
            ))}
          </div>

          <p className="texto-suave mb-2 text-[11px]">
            Todos los enlaces caducan. Uno permanente a la ubicación en vivo de un vehículo
            es, en la práctica, una herramienta para seguir a una persona.
          </p>

          <button
            type="button"
            disabled={creando}
            onClick={() => {
              void crear();
            }}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {creando ? 'Generando…' : 'Crear enlace y copiarlo'}
          </button>
        </div>

        {error !== null && (
          <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs break-all text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {/* ---------- Activos ---------- */}
        <h4 className="texto-suave mb-2 text-[11px] font-semibold tracking-wide uppercase">
          Enlaces activos ({enlaces.length})
        </h4>

        {enlaces.length === 0 ? (
          <p className="texto-suave text-xs">Ninguno por ahora.</p>
        ) : (
          <ul className="space-y-2">
            {enlaces.map((e) => (
              <li key={e.token} className="borde rounded-lg border p-2.5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="truncate text-xs font-medium">
                    {e.label ?? 'Sin etiqueta'}
                  </span>
                  <span className="texto-suave shrink-0 text-[11px]">
                    caduca en {restante(e.expiresAt)}
                  </span>
                </div>
                <p className="texto-suave mb-1.5 text-[11px]">
                  {e.views === 0
                    ? 'Todavía no lo ha abierto nadie'
                    : `Abierto ${String(e.views)} ${e.views === 1 ? 'vez' : 'veces'}`}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void copiar(e.token);
                    }}
                    className="borde flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    {copiado === e.token ? '¡Copiado!' : 'Copiar enlace'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void revocarEnlace(e.token)
                        .then(recargar)
                        .catch(() => {
                          setError('No se pudo revocar');
                        });
                    }}
                    className="rounded-lg bg-red-600/90 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-red-700"
                  >
                    Revocar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
