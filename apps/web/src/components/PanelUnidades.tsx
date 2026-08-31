/**
 * Panel lateral con la lista de unidades: buscador, filtro por estado y orden.
 *
 * Pensado para decenas de unidades: con diez cabrian todas en pantalla, pero el
 * buscador y el filtro son justo lo que hace falta cuando son cuarenta.
 */

import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import {
  CLASES_ESTADO,
  ETIQUETA_ESTADO,
  type Unit,
  type UnitState,
} from '../lib/tipos.ts';

type Orden = 'nombre' | 'velocidad' | 'reciente' | 'estado';

const FILTROS: readonly { valor: UnitState | 'todos'; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todas' },
  { valor: 'moving', etiqueta: 'En movimiento' },
  { valor: 'stopped', etiqueta: 'Detenidas' },
  { valor: 'offline', etiqueta: 'Sin señal' },
];

const ORDENES: readonly { valor: Orden; etiqueta: string }[] = [
  { valor: 'estado', etiqueta: 'Estado' },
  { valor: 'nombre', etiqueta: 'Nombre' },
  { valor: 'velocidad', etiqueta: 'Velocidad' },
  { valor: 'reciente', etiqueta: 'Más reciente' },
];

/** Prioridad de estado al ordenar: lo que se mueve primero, lo perdido al final. */
const PESO_ESTADO: Readonly<Record<UnitState, number>> = {
  moving: 0,
  stopped: 1,
  offline: 2,
  unknown: 3,
};

function tiempoRelativo(iso: string | null): string {
  if (iso === null) return 'sin datos';
  const segundos = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(segundos)) return 'sin datos';
  if (segundos < 60) return 'hace un momento';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  return `hace ${Math.floor(segundos / 86400)} d`;
}

interface Props {
  readonly unidades: readonly Unit[];
  readonly seleccionada: number | null;
  readonly onSeleccionar: (id: number | null) => void;
}

export function PanelUnidades({ unidades, seleccionada, onSeleccionar }: Props): JSX.Element {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<UnitState | 'todos'>('todos');
  const [orden, setOrden] = useState<Orden>('estado');

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    const filtradas = unidades.filter((u) => {
      if (filtro !== 'todos') {
        // "Sin señal" agrupa offline y unknown: para quien mira la pantalla son
        // el mismo problema.
        const coincide =
          filtro === 'offline'
            ? u.state === 'offline' || u.state === 'unknown'
            : u.state === filtro;
        if (!coincide) return false;
      }
      if (termino === '') return true;
      return (
        u.name.toLowerCase().includes(termino) || u.uniqueId.toLowerCase().includes(termino)
      );
    });

    return [...filtradas].sort((a, b) => {
      switch (orden) {
        case 'nombre':
          return a.name.localeCompare(b.name, 'es');
        case 'velocidad':
          return (b.position?.speedKmh ?? -1) - (a.position?.speedKmh ?? -1);
        case 'reciente':
          return (b.position?.fixTime ?? '').localeCompare(a.position?.fixTime ?? '');
        case 'estado':
          return (
            PESO_ESTADO[a.state] - PESO_ESTADO[b.state] || a.name.localeCompare(b.name, 'es')
          );
      }
    });
  }, [unidades, busqueda, filtro, orden]);

  return (
    <div className="flex h-full flex-col">
      {/* Buscador y filtros */}
      <div className="borde shrink-0 space-y-3 border-b px-4 py-3">
        <div className="relative">
          <svg
            className="texto-suave pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
            }}
            placeholder="Buscar unidad o identificador…"
            aria-label="Buscar unidad"
            className="borde panel w-full rounded-lg border py-2 pr-3 pl-9 text-sm
                       outline-none placeholder:opacity-60
                       focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => {
            const activo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => {
                  setFiltro(f.valor);
                }}
                aria-pressed={activo}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  activo
                    ? 'bg-blue-600 text-white'
                    : 'borde texto-suave border hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {f.etiqueta}
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs">
          <span className="texto-suave">Ordenar por</span>
          <select
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value as Orden);
            }}
            className="borde panel flex-1 rounded-md border px-2 py-1 text-xs outline-none
                       focus:ring-2 focus:ring-blue-500/40"
          >
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lista */}
      <div className="scroll-fino min-h-0 flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <div className="texto-suave px-4 py-10 text-center text-sm">
            {unidades.length === 0 ? (
              <>
                <p className="mb-1 font-medium">Todavía no hay unidades</p>
                <p className="text-xs">
                  Arranca el simulador con
                  <code className="mx-1 rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
                    pnpm simulate
                  </code>
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 font-medium">Ninguna unidad coincide</p>
                <p className="text-xs">Prueba con otro filtro o búsqueda.</p>
              </>
            )}
          </div>
        ) : (
          <ul>
            {visibles.map((u) => {
              const activa = u.id === seleccionada;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSeleccionar(activa ? null : u.id);
                    }}
                    aria-current={activa}
                    className={`borde w-full border-b px-4 py-3 text-left transition ${
                      activa
                        ? 'bg-blue-500/10 ring-1 ring-blue-500/30 ring-inset'
                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">{u.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold
                                    ring-1 ring-inset ${CLASES_ESTADO[u.state]}`}
                      >
                        {ETIQUETA_ESTADO[u.state]}
                      </span>
                    </div>

                    <div className="texto-suave flex items-center gap-3 text-xs">
                      <span className="font-mono">{u.uniqueId}</span>
                      {u.position !== null && (
                        <>
                          <span className="tabular-nums">
                            {Math.round(u.position.speedKmh)} km/h
                          </span>
                          {u.position.totalDistanceKm !== null && (
                            <span className="tabular-nums">
                              {u.position.totalDistanceKm.toLocaleString('es-MX', {
                                maximumFractionDigits: 0,
                              })}{' '}
                              km
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="texto-suave mt-0.5 text-[11px]">
                      {tiempoRelativo(u.position?.fixTime ?? null)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="borde texto-suave shrink-0 border-t px-4 py-2 text-xs">
        {visibles.length} de {unidades.length} unidades
      </div>
    </div>
  );
}
