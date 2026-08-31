/**
 * Ficha flotante de la unidad seleccionada, sobre el mapa.
 */

import type { JSX } from 'react';

import { CLASES_ESTADO, ETIQUETA_ESTADO, type Unit } from '../lib/tipos.ts';

interface Props {
  readonly unidad: Unit;
  readonly onCerrar: () => void;
}

interface DatoProps {
  readonly etiqueta: string;
  readonly valor: string;
}

function Dato({ etiqueta, valor }: DatoProps): JSX.Element {
  return (
    <div>
      <div className="texto-suave text-[10px] tracking-wide uppercase">{etiqueta}</div>
      <div className="text-sm font-medium tabular-nums">{valor}</div>
    </div>
  );
}

export function FichaUnidad({ unidad, onCerrar }: Props): JSX.Element {
  const p = unidad.position;

  return (
    <div
      className="borde panel absolute right-4 bottom-8 z-10 w-[min(21rem,calc(100%-2rem))]
                 rounded-xl border p-4 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{unidad.name}</h2>
          <p className="texto-suave font-mono text-xs">{unidad.uniqueId}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset
                        ${CLASES_ESTADO[unidad.state]}`}
          >
            {ETIQUETA_ESTADO[unidad.state]}
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ficha"
            className="texto-suave rounded p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {p === null ? (
        <p className="texto-suave text-sm">Esta unidad todavía no ha reportado ninguna posición.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <Dato etiqueta="Velocidad" valor={`${Math.round(p.speedKmh)} km/h`} />
            <Dato etiqueta="Rumbo" valor={`${Math.round(p.course)}°`} />
            <Dato
              etiqueta="Odómetro"
              valor={
                p.totalDistanceKm === null
                  ? '—'
                  : `${p.totalDistanceKm.toLocaleString('es-MX', { maximumFractionDigits: 0 })} km`
              }
            />
            <Dato
              etiqueta="Horas motor"
              valor={p.engineHours === null ? '—' : `${p.engineHours.toFixed(1)} h`}
            />
            <Dato
              etiqueta="Batería"
              valor={p.battery === null ? '—' : `${Math.round(p.battery)} %`}
            />
            <Dato
              etiqueta="Encendido"
              valor={p.ignition === null ? '—' : p.ignition ? 'Sí' : 'No'}
            />
          </div>

          <div className="borde space-y-1 border-t pt-3">
            <div className="texto-suave flex justify-between text-xs">
              <span>Coordenadas</span>
              <span className="font-mono">
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </span>
            </div>
            <div className="texto-suave flex justify-between text-xs">
              <span>Último reporte</span>
              <span>{new Date(p.fixTime).toLocaleString('es-MX')}</span>
            </div>
          </div>

          {/* Historial y mantenimientos llegan en la siguiente fase. Se deja el
              hueco visible para que se entienda que la ficha va a crecer. */}
          <div className="borde mt-3 border-t pt-3">
            <p className="texto-suave text-[11px]">
              Historial y mantenimientos: próxima fase.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
