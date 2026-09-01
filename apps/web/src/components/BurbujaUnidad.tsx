/**
 * Burbuja que flota sobre cada vehiculo en el mapa.
 *
 * Muestra el icono del tipo de vehiculo y su nombre, para poder identificar
 * cada unidad de un vistazo sin hacer clic. Debajo va una flecha que gira con
 * el rumbo y marca la posicion exacta.
 *
 * El nombre se edita aqui mismo: doble clic sobre el, o el menu de opciones.
 */

import { useEffect, useRef, useState, type JSX } from 'react';

import { COLOR_ESTADO, ETIQUETA_ESTADO, type Unit } from '../lib/tipos.ts';
import { CATEGORIAS, tipoDe, type Categoria } from '../lib/vehiculos.ts';
import { IconoVehiculo } from './IconoVehiculo.tsx';

type Panel = 'ninguno' | 'menu' | 'nombre' | 'icono';

interface Props {
  readonly unidad: Unit;
  readonly seleccionada: boolean;
  readonly compacta: boolean;
  readonly onSeleccionar: (id: number) => void;
  readonly onRenombrar: (id: number, nombre: string) => Promise<void>;
  readonly onCambiarIcono: (id: number, categoria: Categoria) => Promise<void>;
  readonly onCentrar: (id: number) => void;
  /** Avisa al mapa para que suba el z-index de este marcador. */
  readonly onPanelAbierto: (id: number, abierto: boolean) => void;
}

export function BurbujaUnidad({
  unidad,
  seleccionada,
  compacta,
  onSeleccionar,
  onRenombrar,
  onCambiarIcono,
  onCentrar,
  onPanelAbierto,
}: Props): JSX.Element {
  const [panel, setPanel] = useState<Panel>('ninguno');
  const [borrador, setBorrador] = useState(unidad.name);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);

  const color = COLOR_ESTADO[unidad.state];
  const velocidad = Math.round(unidad.position?.speedKmh ?? 0);
  const rumbo = unidad.position?.course ?? 0;

  // El mapa necesita saber si hay un panel abierto para poner este marcador
  // encima de los demas; si no, el menu queda tapado por la burbuja vecina.
  useEffect(() => {
    onPanelAbierto(unidad.id, panel !== 'ninguno');
  }, [panel, unidad.id, onPanelAbierto]);

  /**
   * Abre el editor de nombre.
   *
   * El borrador se siembra AQUI, en el manejador, y no en un efecto que
   * observe `panel`: llamar a setState de forma sincrona dentro de un efecto
   * provoca un render en cascada (regla react-hooks/set-state-in-effect).
   */
  const abrirEditorNombre = (): void => {
    setBorrador(unidad.name);
    setError(null);
    setPanel('nombre');
    // El foco se pide en el siguiente cuadro, cuando el input ya existe.
    requestAnimationFrame(() => {
      entradaRef.current?.focus();
      entradaRef.current?.select();
    });
  };

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (panel === 'ninguno') return;

    const alClicFuera = (evento: MouseEvent): void => {
      if (raizRef.current !== null && !raizRef.current.contains(evento.target as Node)) {
        setPanel('ninguno');
      }
    };
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setPanel('ninguno');
    };

    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alTecla);
    };
  }, [panel]);

  const guardarNombre = async (): Promise<void> => {
    const limpio = borrador.trim();
    if (limpio === '' || limpio === unidad.name) {
      setPanel('ninguno');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onRenombrar(unidad.id, limpio);
      setPanel('ninguno');
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarIcono = async (categoria: Categoria): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      await onCambiarIcono(unidad.id, categoria);
      setPanel('ninguno');
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div ref={raizRef} className="flex flex-col items-center">
      {/* ---------- Burbuja ---------- */}
      <div
        className={`panel relative flex items-center gap-1.5 rounded-full border-2 py-1
                    sombra-suave transition-all ${compacta ? 'px-1' : 'pr-1 pl-1.5'}
                    ${seleccionada ? 'scale-105 ring-2 ring-indigo-500 ring-offset-1' : ''}
                    ${unidad.state === 'offline' || unidad.state === 'unknown' ? 'opacity-70' : ''}`}
        style={{ borderColor: color }}
      >
        <button
          type="button"
          onClick={() => {
            onSeleccionar(unidad.id);
          }}
          onDoubleClick={abrirEditorNombre}
          className="flex items-center gap-1.5 rounded-full"
          title={`${unidad.name} · ${ETIQUETA_ESTADO[unidad.state]}${
            unidad.position === null ? '' : ` · ${velocidad} km/h`
          }\nDoble clic para renombrar`}
        >
          <span
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: color }}
          >
            <IconoVehiculo categoria={unidad.category} className="h-4 w-4" />
            {/* Anillo que late solo mientras la unidad circula: distingue de un
                vistazo lo que se mueve de lo que esta detenido, sin leer nada. */}
            {unidad.state === 'moving' && (
              <span
                className="pulso absolute inset-0 rounded-full ring-2"
                style={{ color }}
                aria-hidden="true"
              />
            )}
          </span>

          {!compacta && (
            <>
              <span className="max-w-36 truncate text-xs leading-none font-semibold">
                {unidad.name}
              </span>
              {unidad.state === 'moving' && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold tabular-nums text-white"
                  style={{ backgroundColor: color }}
                >
                  {velocidad}
                </span>
              )}
            </>
          )}
        </button>

        {!compacta && (
          <button
            type="button"
            onClick={() => {
              setPanel((p) => (p === 'ninguno' ? 'menu' : 'ninguno'));
            }}
            aria-label={`Opciones de ${unidad.name}`}
            aria-expanded={panel !== 'ninguno'}
            className="texto-suave flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                       transition hover:bg-black/10 dark:hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        )}

        {/* ---------- Menú de opciones ---------- */}
        {panel === 'menu' && (
          <div
            className="borde panel aparecer absolute top-full left-1/2 z-10 mt-2 w-48 -translate-x-1/2
                       overflow-hidden rounded-2xl border sombra-alta"
            role="menu"
          >
            <OpcionMenu
              texto="Cambiar nombre"
              onClick={abrirEditorNombre}
              icono={
                <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" strokeLinejoin="round" />
              }
            />
            <OpcionMenu
              texto="Cambiar ícono"
              onClick={() => {
                setPanel('icono');
              }}
              icono={<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="m3 14 4-4 5 5 3-3 6 5" strokeLinejoin="round" /></>}
            />
            <OpcionMenu
              texto="Centrar aquí"
              onClick={() => {
                onCentrar(unidad.id);
                setPanel('ninguno');
              }}
              icono={<><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" /></>}
            />
            <OpcionMenu
              texto="Ver detalle"
              onClick={() => {
                onSeleccionar(unidad.id);
                setPanel('ninguno');
              }}
              icono={<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" strokeLinecap="round" /></>}
            />
          </div>
        )}

        {/* ---------- Editar nombre ---------- */}
        {panel === 'nombre' && (
          <div
            className="borde panel aparecer absolute top-full left-1/2 z-10 mt-2 w-64 -translate-x-1/2
                       rounded-2xl border p-3 sombra-alta"
          >
            <label className="texto-suave mb-1 block text-xs font-medium tracking-wide uppercase">
              Nombre de la unidad
            </label>
            <input
              ref={entradaRef}
              value={borrador}
              disabled={guardando}
              maxLength={80}
              onChange={(e) => {
                setBorrador(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void guardarNombre();
              }}
              className="borde panel mb-2 w-full rounded-lg border px-2 py-1.5 text-xs outline-none
                         focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            />
            <p className="texto-suave mb-2 text-xs">
              Identificador <span className="font-mono">{unidad.uniqueId}</span> · no cambia
            </p>
            {error !== null && (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  void guardarNombre();
                }}
                className="flex-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white
                           transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setPanel('ninguno');
                }}
                className="borde texto-suave rounded-lg border px-2 py-1.5 text-xs transition
                           hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ---------- Elegir ícono ---------- */}
        {panel === 'icono' && (
          <div
            className="borde panel aparecer absolute top-full left-1/2 z-10 mt-2 w-60 -translate-x-1/2
                       rounded-2xl border p-3 sombra-alta"
          >
            <p className="texto-suave mb-2 text-xs font-medium tracking-wide uppercase">
              Tipo de vehículo
            </p>
            <div className="grid grid-cols-3 gap-1">
              {CATEGORIAS.map((categoria) => {
                const activo = (unidad.category ?? 'default') === categoria;
                return (
                  <button
                    key={categoria}
                    type="button"
                    disabled={guardando}
                    onClick={() => {
                      void cambiarIcono(categoria);
                    }}
                    title={tipoDe(categoria).etiqueta}
                    className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition
                                disabled:opacity-50 ${
                                  activo
                                    ? 'bg-indigo-600 text-white'
                                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                  >
                    <IconoVehiculo categoria={categoria} className="h-5 w-5" />
                    <span className="text-xs leading-tight">
                      {tipoDe(categoria).etiqueta}
                    </span>
                  </button>
                );
              })}
            </div>
            {error !== null && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}
      </div>

      {/* ---------- Colita de la burbuja ---------- */}
      <div
        className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent"
        style={{ borderTopColor: color }}
      />

      {/* ---------- Flecha de rumbo, sobre la posición exacta ---------- */}
      {/*
        La rotacion la aplica el BUCLE DE ANIMACION del mapa buscando
        [data-rumbo], no React. Si fuera un estilo en linea, cada render la
        sobrescribiria a media animacion y la flecha daria tirones.
      */}
      <div
        data-rumbo={Math.round(rumbo)}
        className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2
                   border-white sombra-suave"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
          <path d="M12 3.5 18.5 20 12 16.2 5.5 20Z" />
        </svg>
      </div>
    </div>
  );
}

interface OpcionProps {
  readonly texto: string;
  readonly onClick: () => void;
  readonly icono: JSX.Element;
}

function OpcionMenu({ texto, onClick, icono }: OpcionProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition
                 hover:bg-black/5 dark:hover:bg-white/10"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="texto-suave h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        {icono}
      </svg>
      {texto}
    </button>
  );
}
