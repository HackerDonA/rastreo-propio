/**
 * Panel de geocercas: lista, dibujo y vinculación con unidades.
 *
 * El dibujo se hace a mano con clics sobre el mapa, sin biblioteca de edición.
 * Para círculo y polígono simple —que es el 100 % de lo que necesita una flota
 * de reparto— una dependencia como mapbox-gl-draw pesaría más que el código
 * que sustituye, y además no es compatible con MapLibre 5 sin parches.
 */

import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  actualizarGeocerca,
  borrarGeocerca,
  crearGeocerca,
  type Geocerca,
  type Geometria,
} from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';
import { IconoVehiculo } from './IconoVehiculo.tsx';

export type ModoDibujo = 'circulo' | 'poligono' | null;

interface Props {
  readonly geocercas: readonly Geocerca[];
  readonly unidades: readonly Unit[];
  readonly modo: ModoDibujo;
  readonly puntos: readonly (readonly [number, number])[];
  readonly onCambiarModo: (modo: ModoDibujo) => void;
  readonly onLimpiarPuntos: () => void;
  readonly onQuitarUltimoPunto: () => void;
  readonly onRecargar: () => void;
  readonly onCentrarEn: (anillo: readonly (readonly [number, number])[]) => void;
}

/** Distancia en metros entre dos coordenadas [lon, lat]. */
function distanciaMetros(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6_371_000;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Construye la geometría a partir de los puntos capturados.
 *
 * Para el círculo: el primer clic es el centro y el segundo define el radio.
 * Es más natural que teclear metros, porque se ve el tamaño real sobre las
 * calles mientras se hace.
 */
export function geometriaDesdePuntos(
  modo: ModoDibujo,
  puntos: readonly (readonly [number, number])[],
): Geometria | null {
  if (modo === 'circulo') {
    const centro = puntos[0];
    const borde = puntos[1];
    if (centro === undefined || borde === undefined) return null;
    const radio = distanciaMetros(centro, borde);
    if (radio < 1) return null;
    return { tipo: 'circulo', latitud: centro[1], longitud: centro[0], radio };
  }
  if (modo === 'poligono' && puntos.length >= 3) {
    return { tipo: 'poligono', puntos };
  }
  return null;
}

export function PanelGeocercas({
  geocercas,
  unidades,
  modo,
  puntos,
  onCambiarModo,
  onLimpiarPuntos,
  onQuitarUltimoPunto,
  onRecargar,
  onCentrarEn,
}: Props): JSX.Element {
  const [nombre, setNombre] = useState('');
  const [seleccion, setSeleccion] = useState<ReadonlySet<number>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Geocerca | null>(null);

  const geometria = geometriaDesdePuntos(modo, puntos);

  // Escape cancela el dibujo. Es lo que espera cualquiera que haya usado un
  // editor de mapas.
  useEffect(() => {
    if (modo === null) return;
    const alTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCambiarModo(null);
        onLimpiarPuntos();
      }
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
    };
  }, [modo, onCambiarModo, onLimpiarPuntos]);

  const cancelar = useCallback(() => {
    onCambiarModo(null);
    onLimpiarPuntos();
    setNombre('');
    setSeleccion(new Set());
    setEditando(null);
    setError(null);
  }, [onCambiarModo, onLimpiarPuntos]);

  const guardar = useCallback(async (): Promise<void> => {
    if (geometria === null || nombre.trim() === '') return;
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        name: nombre.trim(),
        geometria,
        deviceIds: [...seleccion],
      };
      if (editando === null) await crearGeocerca(datos);
      else await actualizarGeocerca(editando.id, datos);
      cancelar();
      onRecargar();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }, [geometria, nombre, seleccion, editando, cancelar, onRecargar]);

  const alternarUnidad = (id: number): void => {
    setSeleccion((previa) => {
      const s = new Set(previa);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* ---------- Barra de creación ---------- */}
      <div className="borde shrink-0 border-b px-4 py-3">
        {modo === null ? (
          <>
            <p className="texto-suave mb-2 text-[11px]">
              Dibuja una zona sobre el mapa para que te avise cuando una unidad entre o salga.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onCambiarModo('circulo');
                  onLimpiarPuntos();
                }}
                className="borde flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                ◯ Círculo
              </button>
              <button
                type="button"
                onClick={() => {
                  onCambiarModo('poligono');
                  onLimpiarPuntos();
                }}
                className="borde flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                ⬠ Polígono
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md bg-amber-500/12 px-2.5 py-2 text-[11px] ring-1 ring-amber-500/25 ring-inset">
              {modo === 'circulo' ? (
                <span>
                  {puntos.length === 0
                    ? 'Haz clic en el CENTRO de la zona.'
                    : puntos.length === 1
                      ? 'Ahora haz clic en el BORDE para fijar el radio.'
                      : `Radio: ${String(Math.round(geometria?.tipo === 'circulo' ? geometria.radio : 0))} m`}
                </span>
              ) : (
                <span>
                  {puntos.length < 3
                    ? `Haz clic para marcar las esquinas. Faltan ${String(3 - puntos.length)}.`
                    : `${String(puntos.length)} esquinas. Sigue marcando o guarda.`}
                </span>
              )}
              <span className="texto-suave block">Esc para cancelar.</span>
            </div>

            <input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
              }}
              placeholder="Nombre de la zona (ej. Patio Norte)"
              className="borde panel w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/40"
            />

            <div>
              <p className="texto-suave mb-1 text-[10px] font-medium tracking-wide uppercase">
                Unidades que vigila ({seleccion.size})
              </p>
              {/* Sin al menos una unidad la geocerca existe, se dibuja, y NO
                  genera ni un solo evento. Es la confusión más común. */}
              {seleccion.size === 0 && (
                <p className="mb-1 text-[10px] text-amber-600 dark:text-amber-400">
                  Sin unidades no te va a avisar de nada.
                </p>
              )}
              <div className="borde scroll-fino max-h-32 overflow-y-auto rounded-md border">
                {unidades.map((u) => (
                  <label
                    key={u.id}
                    className="borde flex cursor-pointer items-center gap-2 border-b px-2 py-1 text-xs last:border-b-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={seleccion.has(u.id)}
                      onChange={() => {
                        alternarUnidad(u.id);
                      }}
                      className="h-3 w-3 accent-blue-600"
                    />
                    <span className="texto-suave shrink-0">
                      <IconoVehiculo categoria={u.category} className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate">{u.name}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSeleccion(new Set(unidades.map((u) => u.id)));
                }}
                className="texto-suave mt-1 text-[10px] underline"
              >
                Seleccionar todas
              </button>
            </div>

            {error !== null && (
              <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={guardando || geometria === null || nombre.trim() === ''}
                onClick={() => {
                  void guardar();
                }}
                className="flex-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                {guardando ? 'Guardando…' : 'Guardar zona'}
              </button>
              {puntos.length > 0 && (
                <button
                  type="button"
                  onClick={onQuitarUltimoPunto}
                  title="Deshacer el último punto"
                  className="borde texto-suave rounded-md border px-2 py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/5"
                >
                  ↶
                </button>
              )}
              <button
                type="button"
                onClick={cancelar}
                className="borde texto-suave rounded-md border px-2 py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Lista ---------- */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {geocercas.length === 0 ? (
          <div className="texto-suave px-4 py-10 text-center text-sm">
            <p className="mb-1 font-medium">Todavía no hay zonas</p>
            <p className="text-xs">
              Una geocerca te avisa cuando un vehículo entra o sale de un área: un patio,
              una ruta, la casa de un cliente.
            </p>
          </div>
        ) : (
          <ul>
            {geocercas.map((g) => (
              <li key={g.id} className="borde border-b px-4 py-2.5">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCentrarEn(g.anillo);
                    }}
                    className="min-w-0 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{g.name}</span>
                    <span className="texto-suave text-[11px]">
                      {g.geometria.tipo === 'circulo'
                        ? `Círculo · ${String(Math.round(g.geometria.radio))} m`
                        : `Polígono · ${String(g.geometria.puntos.length)} esquinas`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void borrarGeocerca(g.id).then(onRecargar).catch(() => {
                        setError('No se pudo borrar la zona');
                      });
                    }}
                    aria-label={`Borrar ${g.name}`}
                    className="texto-suave shrink-0 rounded p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p
                  className={`text-[11px] ${
                    g.deviceIds.length === 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'texto-suave'
                  }`}
                >
                  {g.deviceIds.length === 0
                    ? '⚠ Sin unidades: no genera avisos'
                    : `Vigila ${String(g.deviceIds.length)} unidad${g.deviceIds.length === 1 ? '' : 'es'}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="borde texto-suave shrink-0 border-t px-4 py-2 text-xs">
        {geocercas.length} zona{geocercas.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
