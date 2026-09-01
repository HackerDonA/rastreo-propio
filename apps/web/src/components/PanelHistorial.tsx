/**
 * Historial de una unidad: cronología del periodo y descarga del recorrido.
 *
 * La lista mezcla viajes, paradas y eventos en orden, que es como uno recuerda
 * un día: "salió a las 8, estuvo en el cliente hasta las 9, se pasó de
 * velocidad a las 9:40".
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';

import {
  descargarRecorrido,
  obtenerHistorial,
  obtenerLineaTiempo,
  type ElementoLinea,
  type Formato,
  type LineaTiempo,
  type PuntoHistorial,
} from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';
import { IconoVehiculo } from './IconoVehiculo.tsx';

/** Rangos rápidos. Cubren casi todo lo que se consulta en el día a día. */
const RANGOS = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: '7d', etiqueta: '7 días' },
  { id: '30d', etiqueta: '30 días' },
] as const;

type RangoId = (typeof RANGOS)[number]['id'];

function calcularRango(id: RangoId): { from: string; to: string } {
  const ahora = new Date();
  const inicioDeHoy = new Date(ahora);
  inicioDeHoy.setHours(0, 0, 0, 0);

  switch (id) {
    case 'hoy':
      return { from: inicioDeHoy.toISOString(), to: ahora.toISOString() };
    case 'ayer': {
      const inicioAyer = new Date(inicioDeHoy);
      inicioAyer.setDate(inicioAyer.getDate() - 1);
      return { from: inicioAyer.toISOString(), to: inicioDeHoy.toISOString() };
    }
    case '7d':
    case '30d': {
      const dias = id === '7d' ? 7 : 30;
      const desde = new Date(ahora);
      desde.setDate(desde.getDate() - dias);
      return { from: desde.toISOString(), to: ahora.toISOString() };
    }
  }
}

const hora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

const fecha = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

function duracion(minutos: number): string {
  if (minutos < 60) return `${String(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${String(h)} h` : `${String(h)} h ${String(m)} min`;
}

interface Props {
  readonly unidades: readonly Unit[];
  /** Unidad preseleccionada al abrir la pestaña. */
  readonly seleccionada: number | null;
  /** El mapa dibuja el recorrido que se devuelve aquí. */
  readonly onRecorrido: (puntos: readonly PuntoHistorial[]) => void;
}

export function PanelHistorial({ unidades, seleccionada, onRecorrido }: Props): JSX.Element {
  const [unidadId, setUnidadId] = useState<number | null>(seleccionada ?? unidades[0]?.id ?? null);
  const [rango, setRango] = useState<RangoId>('hoy');
  const [datos, setDatos] = useState<LineaTiempo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<Formato | null>(null);

  const periodo = useMemo(() => calcularRango(rango), [rango]);

  const consultar = useCallback(async (): Promise<void> => {
    if (unidadId === null) return;
    setCargando(true);
    setError(null);
    try {
      // La cronología y el trazo se piden a la vez: son independientes y en
      // serie tardarían el doble para lo mismo.
      const [linea, historial] = await Promise.all([
        obtenerLineaTiempo(unidadId, periodo.from, periodo.to),
        obtenerHistorial(unidadId, periodo.from, periodo.to),
      ]);
      setDatos(linea);
      onRecorrido(historial.points);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo consultar');
      setDatos(null);
      onRecorrido([]);
    } finally {
      setCargando(false);
    }
  }, [unidadId, periodo, onRecorrido]);

  useEffect(() => {
    // `consultar` es asincrona: sus setState ocurren despues del primer await,
    // asi que no hay render en cascada. La regla no puede distinguirlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void consultar();
  }, [consultar]);

  // Al cerrar la vista, el mapa deja de mostrar el recorrido.
  useEffect(
    () => () => {
      onRecorrido([]);
    },
    [onRecorrido],
  );

  const descargar = async (formato: Formato): Promise<void> => {
    if (unidadId === null) return;
    setDescargando(formato);
    try {
      await descargarRecorrido(unidadId, periodo.from, periodo.to, formato);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo descargar');
    } finally {
      setDescargando(null);
    }
  };

  const unidad = unidades.find((u) => u.id === unidadId) ?? null;

  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        {/* ---------- Selección ---------- */}
        <div className="tarjeta space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="texto-suave text-xs font-medium" htmlFor="h-unidad">
              Unidad
            </label>
            <select
              id="h-unidad"
              value={unidadId ?? ''}
              onChange={(e) => {
                setUnidadId(Number(e.target.value));
              }}
              className="borde panel min-w-48 flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RANGOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRango(r.id);
                }}
                aria-pressed={rango === r.id}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  rango === r.id
                    ? 'bg-indigo-600 text-white'
                    : 'borde texto-suave border hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {r.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {error !== null && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {cargando && (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="tarjeta animate-pulse p-4">
                <div className="h-3 w-1/3 rounded bg-black/8 dark:bg-white/10" />
              </div>
            ))}
          </div>
        )}

        {datos !== null && !cargando && (
          <>
            {/* ---------- Resumen ---------- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato etiqueta="Recorrido" valor={`${String(datos.resumen.distanciaKm)} km`} />
              <Dato etiqueta="Viajes" valor={String(datos.resumen.viajes)} />
              <Dato
                etiqueta="En movimiento"
                valor={duracion(datos.resumen.minutosEnMovimiento)}
              />
              <Dato
                etiqueta="Velocidad máx."
                valor={`${String(datos.resumen.velocidadMaxKmh)} km/h`}
              />
            </div>

            {/* ---------- Descargas ---------- */}
            <div className="tarjeta p-4">
              <p className="texto-suave mb-2 text-xs font-medium">
                Descargar el recorrido completo
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { f: 'csv' as const, e: 'CSV', n: 'para Excel' },
                    { f: 'gpx' as const, e: 'GPX', n: 'Google Earth, Garmin' },
                    { f: 'geojson' as const, e: 'GeoJSON', n: 'para SIG' },
                  ]
                ).map(({ f, e, n }) => (
                  <button
                    key={f}
                    type="button"
                    disabled={descargando !== null}
                    onClick={() => {
                      void descargar(f);
                    }}
                    title={n}
                    className="borde rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
                  >
                    {descargando === f ? 'Generando…' : e}
                  </button>
                ))}
              </div>
              <p className="texto-suave mt-2 text-[11px]">
                Sale sin simplificar, con todos los puntos. Lo que ves en el mapa está
                simplificado para que dibuje rápido.
              </p>
            </div>

            {/* ---------- Cronología ---------- */}
            <section>
              <h2 className="texto-suave mb-2 text-[11px] font-semibold tracking-wide uppercase">
                Qué pasó, en orden
              </h2>

              {datos.elementos.length === 0 ? (
                <div className="tarjeta p-8 text-center">
                  <p className="mb-1 text-sm font-medium">Sin actividad en este periodo</p>
                  <p className="texto-suave text-xs">
                    {unidad === null
                      ? 'Elige una unidad.'
                      : 'Prueba con un rango más amplio.'}
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-2 pl-6">
                  {/* Línea vertical que une los hitos: convierte una lista en
                      una cronología de un vistazo. */}
                  <span
                    className="borde absolute top-2 bottom-2 left-2 w-px bg-current opacity-20"
                    aria-hidden="true"
                  />
                  {datos.elementos.map((e, i) => (
                    <Hito key={`${e.tipo}-${e.inicio}-${String(i)}`} elemento={e} />
                  ))}
                </ol>
              )}
            </section>
          </>
        )}

        {unidad !== null && (
          <p className="texto-suave flex items-center gap-1.5 text-[11px]">
            <IconoVehiculo categoria={unidad.category} className="h-3.5 w-3.5" />
            {unidad.name} · {fecha(periodo.from)} a {fecha(periodo.to)}
          </p>
        )}
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: string }): JSX.Element {
  return (
    <div className="tarjeta p-3">
      <div className="texto-suave text-[11px] tracking-wide uppercase">{etiqueta}</div>
      <div className="text-xl leading-tight font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

const COLOR_HITO: Readonly<Record<string, string>> = {
  viaje: 'bg-indigo-500',
  parada: 'bg-slate-400',
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  alarm: 'bg-red-600',
};

function Hito({ elemento }: { readonly elemento: ElementoLinea }): JSX.Element {
  const color =
    elemento.tipo === 'evento'
      ? (COLOR_HITO[elemento.severidad] ?? 'bg-blue-500')
      : COLOR_HITO[elemento.tipo];

  return (
    <li className="relative">
      <span
        className={`panel absolute top-2.5 -left-[1.15rem] h-2.5 w-2.5 rounded-full ring-2 ${color}`}
        aria-hidden="true"
      />
      <div className="tarjeta px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">
            {elemento.tipo === 'viaje' && `Viaje · ${String(elemento.distanciaKm)} km`}
            {elemento.tipo === 'parada' && `Parada · ${duracion(elemento.duracionMin)}`}
            {elemento.tipo === 'evento' && elemento.mensaje}
          </span>
          <span className="texto-suave text-[11px] tabular-nums">
            {hora(elemento.inicio)}
            {elemento.tipo !== 'evento' && ` – ${hora(elemento.fin)}`}
          </span>
        </div>

        {elemento.tipo === 'viaje' && (
          <p className="texto-suave text-[11px]">
            {duracion(elemento.duracionMin)} · media {String(elemento.velocidadMediaKmh)} km/h ·
            máx {String(elemento.velocidadMaxKmh)} km/h
          </p>
        )}
        {elemento.tipo === 'parada' && elemento.direccion !== null && (
          <p className="texto-suave truncate text-[11px]">{elemento.direccion}</p>
        )}
      </div>
    </li>
  );
}
