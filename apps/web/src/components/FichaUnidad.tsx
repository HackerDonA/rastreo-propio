/**
 * Ficha flotante de la unidad seleccionada, sobre el mapa.
 */

import { useState, type JSX } from 'react';

import type { Ficha } from '../lib/flota-api.ts';
import { CLASES_ESTADO, ETIQUETA_ESTADO, type Unit } from '../lib/tipos.ts';

interface Props {
  readonly unidad: Unit;
  readonly ficha: Ficha | null;
  readonly onCerrar: () => void;
  readonly onEditarFicha: () => void;
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

export function FichaUnidad({ unidad, ficha, onCerrar, onEditarFicha }: Props): JSX.Element {
  const p = unidad.position;

  return (
    <div
      className="borde panel absolute right-4 bottom-8 z-10 w-[min(21rem,calc(100%-2rem))]
                 rounded-xl border p-4 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{unidad.name}</h2>
          <p className="texto-suave font-mono text-xs">
            {ficha?.plate ?? unidad.uniqueId}
            {ficha?.plate != null && (
              <span className="ml-1.5 opacity-60">· {unidad.uniqueId}</span>
            )}
          </p>
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

          {/* ---------- Ficha administrativa ---------- */}
          <div className="borde mt-3 border-t pt-3">
            {ficha === null ? (
              <button
                type="button"
                onClick={onEditarFicha}
                className="borde w-full rounded-md border border-dashed px-2 py-2 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                + Capturar placa, conductor y documentos
              </button>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="texto-suave text-[10px] font-semibold tracking-wide uppercase">
                    Ficha del vehículo
                  </span>
                  <button
                    type="button"
                    onClick={onEditarFicha}
                    className="texto-suave text-[10px] underline"
                  >
                    Editar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ficha.driverName !== null && (
                    <Dato etiqueta="Conductor" valor={ficha.driverName} />
                  )}
                  {ficha.assignment !== null && (
                    <Dato etiqueta="Ruta" valor={ficha.assignment} />
                  )}
                  {(ficha.brand !== null || ficha.model !== null) && (
                    <Dato
                      etiqueta="Vehículo"
                      valor={[ficha.brand, ficha.model, ficha.year]
                        .filter((x) => x !== null)
                        .join(' ')}
                    />
                  )}
                  {ficha.odometerOffsetKm !== null && p.totalDistanceKm !== null && (
                    <Dato
                      etiqueta="Km reales"
                      valor={`${(ficha.odometerOffsetKm + p.totalDistanceKm).toLocaleString(
                        'es-MX',
                        { maximumFractionDigits: 0 },
                      )} km`}
                    />
                  )}
                </div>
                <Vencimientos ficha={ficha} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Documentos por vencer.
 *
 * Solo se muestran los que ya urgen: una fecha a seis meses no aporta nada en
 * una ficha que se consulta de pasada.
 */
function Vencimientos({ ficha }: { readonly ficha: Ficha }): JSX.Element | null {
  // El reloj se captura al montar, no en cada render. Leer Date.now() durante
  // el render hace que el resultado dependa de CUANDO se pinta, que es justo
  // lo que la regla react-hooks/purity impide. Para un vencimiento medido en
  // dias, el instante del montaje es tan bueno como cualquier otro.
  const [hoy] = useState(() => Date.now());
  const dias = (iso: string | null): number | null =>
    iso === null ? null : Math.ceil((new Date(iso).getTime() - hoy) / 86_400_000);

  const docs = [
    { etiqueta: 'Seguro', d: dias(ficha.insuranceExpires) },
    { etiqueta: 'Verificación', d: dias(ficha.inspectionExpires) },
    { etiqueta: 'Tenencia', d: dias(ficha.registrationExpires) },
  ].filter((x): x is { etiqueta: string; d: number } => x.d !== null && x.d <= 60);

  if (docs.length === 0) return null;

  return (
    <div className="borde mt-2 space-y-0.5 border-t pt-2">
      {docs.map((x) => (
        <div key={x.etiqueta} className="flex justify-between text-[11px]">
          <span className="texto-suave">{x.etiqueta}</span>
          <span
            className={
              x.d < 0
                ? 'font-medium text-red-600 dark:text-red-400'
                : 'font-medium text-amber-600 dark:text-amber-400'
            }
          >
            {x.d < 0 ? `vencido hace ${String(-x.d)} d` : `vence en ${String(x.d)} d`}
          </span>
        </div>
      ))}
    </div>
  );
}
