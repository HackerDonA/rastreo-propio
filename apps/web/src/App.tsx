import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import { actualizarUnidad } from './lib/api.ts';
import {
  obtenerFichas,
  obtenerGeocercas,
  type Ficha,
  type Geocerca,
  type PuntoHistorial,
} from './lib/flota-api.ts';
import { BarraFlota } from './components/BarraFlota.tsx';
import { CentroAvisos } from './components/CentroAvisos.tsx';
import { FichaVehiculo } from './components/FichaVehiculo.tsx';
import { PanelComandos } from './components/PanelComandos.tsx';
import { PanelGeocercas, type ModoDibujo } from './components/PanelGeocercas.tsx';
import { PanelHistorial } from './components/PanelHistorial.tsx';
import { FichaUnidad } from './components/FichaUnidad.tsx';
import { CAPAS, MapaEnVivo, type CapaMapa } from './components/MapaEnVivo.tsx';
import { PanelMantenimientos } from './components/PanelMantenimientos.tsx';
import { PanelUnidades } from './components/PanelUnidades.tsx';
import { useFlota } from './lib/useFlota.ts';
import type { Categoria } from './lib/vehiculos.ts';

type Vista = 'mapa' | 'historial' | 'mantenimientos';

/** Lee el tema aplicado por el script en linea de index.html. */
function temaInicial(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Recupera el interruptor de nombres; por omision, encendidos. */
function nombresIniciales(): boolean {
  try {
    return localStorage.getItem('mostrarNombres') !== 'no';
  } catch {
    return true;
  }
}

export function App(): JSX.Element {
  const { unidades, carga, error, enVivo, recargar, aplicarUnidad, eventosEntrantes } =
    useFlota();
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [oscuro, setOscuro] = useState(temaInicial);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [mostrarNombres, setMostrarNombres] = useState(nombresIniciales);
  const [vista, setVista] = useState<Vista>('mapa');
  const [pestanaLateral, setPestanaLateral] = useState<'unidades' | 'zonas'>('unidades');
  const [geocercas, setGeocercas] = useState<readonly Geocerca[]>([]);
  const [fichas, setFichas] = useState<ReadonlyMap<number, Ficha>>(new Map());
  const [editandoFicha, setEditandoFicha] = useState<number | null>(null);
  const [comandosDe, setComandosDe] = useState<number | null>(null);
  const [modoDibujo, setModoDibujo] = useState<ModoDibujo>(null);
  const [puntosDibujo, setPuntosDibujo] = useState<readonly (readonly [number, number])[]>([]);
  const [encuadre, setEncuadre] = useState<readonly (readonly [number, number])[] | null>(
    null,
  );
  const [recorrido, setRecorrido] = useState<readonly (readonly [number, number])[]>([]);
  const [capa, setCapa] = useState<CapaMapa>(() => {
    try {
      const guardada = localStorage.getItem('capaMapa');
      return guardada !== null && guardada in CAPAS ? (guardada as CapaMapa) : 'calles';
    } catch {
      return 'calles';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro);
    try {
      localStorage.setItem('tema', oscuro ? 'oscuro' : 'claro');
    } catch {
      // En modo privado localStorage puede lanzar. El tema simplemente no se
      // recuerda entre sesiones, que es una degradacion aceptable.
    }
  }, [oscuro]);

  const recargarGeocercas = useCallback(() => {
    obtenerGeocercas()
      .then(setGeocercas)
      .catch(() => {
        // Sin geocercas la aplicacion sigue siendo util; no vale la pena
        // bloquear el mapa por esto.
      });
  }, []);

  const recargarFichas = useCallback(() => {
    obtenerFichas()
      .then(setFichas)
      .catch(() => {
        /* idem: las fichas son un extra sobre la telemetria */
      });
  }, []);

  useEffect(() => {
    recargarGeocercas();
    recargarFichas();
  }, [recargarGeocercas, recargarFichas]);

  const cambiarTema = useCallback(() => {
    setOscuro((v) => !v);
  }, []);

  const seleccionar = useCallback((id: number | null) => {
    setSeleccionada(id);
    setPanelAbierto(false);
  }, []);

  const cambiarNombres = useCallback(() => {
    setMostrarNombres((v) => {
      const siguiente = !v;
      try {
        localStorage.setItem('mostrarNombres', siguiente ? 'si' : 'no');
      } catch {
        // En modo privado no se recuerda entre sesiones. Aceptable.
      }
      return siguiente;
    });
  }, []);

  // Los errores se dejan propagar a propósito: la burbuja los atrapa y los
  // muestra junto al campo que el usuario acaba de editar, que es donde
  // sirven. Tragarlos aquí haría que un fallo pareciera un guardado exitoso.
  const renombrar = useCallback(
    async (id: number, nombre: string): Promise<void> => {
      aplicarUnidad(await actualizarUnidad(id, { name: nombre }));
    },
    [aplicarUnidad],
  );

  const cambiarIcono = useCallback(
    async (id: number, categoria: Categoria): Promise<void> => {
      aplicarUnidad(await actualizarUnidad(id, { category: categoria }));
    },
    [aplicarUnidad],
  );

  const agregarPunto = useCallback(
    (punto: readonly [number, number]) => {
      setPuntosDibujo((previos) => {
        // El circulo se define con exactamente dos clics: centro y borde. Un
        // tercero solo confundiria.
        if (modoDibujo === 'circulo' && previos.length >= 2) return [punto];
        return [...previos, punto];
      });
    },
    [modoDibujo],
  );

  const quitarUltimoPunto = useCallback(() => {
    setPuntosDibujo((previos) => previos.slice(0, -1));
  }, []);

  const limpiarPuntos = useCallback(() => {
    setPuntosDibujo([]);
  }, []);

  const centrarEnAnillo = useCallback(
    (anillo: readonly (readonly [number, number])[]) => {
      setVista('mapa');
      // Se crea un arreglo nuevo a proposito: el efecto del mapa reacciona al
      // cambio de referencia, asi que reencuadrar en la MISMA zona dos veces
      // seguidas tambien funciona.
      setEncuadre([...anillo]);
    },
    [],
  );

  const mostrarRecorrido = useCallback((puntos: readonly PuntoHistorial[]) => {
    setRecorrido(puntos.map((p) => [p.longitude, p.latitude] as const));
  }, []);

  const irAUnidad = useCallback((deviceId: number) => {
    setVista('mapa');
    setSeleccionada(deviceId);
  }, []);

  const unidadSeleccionada = unidades.find((u) => u.id === seleccionada) ?? null;
  const fichaSeleccionada =
    seleccionada === null ? null : (fichas.get(seleccionada) ?? null);
  const unidadEditando =
    editandoFicha === null ? null : (unidades.find((u) => u.id === editandoFicha) ?? null);
  const unidadComandos =
    comandosDe === null ? null : (unidades.find((u) => u.id === comandosDe) ?? null);

  // Vista previa del circulo mientras se dibuja: se calcula igual que en el
  // backend para que lo que se ve sea lo que se guarda.
  const anilloPrevio = (():
    | readonly (readonly [number, number])[]
    | null => {
    if (modoDibujo !== 'circulo' || puntosDibujo.length < 2) return null;
    const centro = puntosDibujo[0];
    const borde = puntosDibujo[1];
    if (centro === undefined || borde === undefined) return null;
    const R = 6_371_000;
    const rad = (d: number): number => (d * Math.PI) / 180;
    const dLat = rad(borde[1] - centro[1]);
    const dLon = rad(borde[0] - centro[0]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(centro[1])) * Math.cos(rad(borde[1])) * Math.sin(dLon / 2) ** 2;
    const radio = 2 * R * Math.asin(Math.sqrt(h));
    const gLat = radio / 111_320;
    const gLon = radio / (111_320 * Math.cos(rad(centro[1])));
    return Array.from({ length: 65 }, (_, i) => {
      const ang = (i / 64) * 2 * Math.PI;
      return [centro[0] + gLon * Math.cos(ang), centro[1] + gLat * Math.sin(ang)] as const;
    });
  })();

  // --- Error de carga -------------------------------------------------------
  if (carga === 'error') {
    return (
      <div className="superficie flex h-dvh items-center justify-center p-6">
        <div className="borde panel max-w-md rounded-2xl border p-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/12 text-red-600 dark:text-red-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
              <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 className="mb-1 text-base font-semibold">No se pudo cargar la flota</h1>
          <p className="texto-suave mb-4 text-sm">{error}</p>
          <div className="texto-suave mb-4 space-y-1 text-left text-xs">
            <p>Comprueba, en este orden:</p>
            <p>
              1.{' '}
              <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">pnpm infra:ps</code>{' '}
              — los dos contenedores en <em>healthy</em>
            </p>
            <p>
              2.{' '}
              <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">pnpm dev</code>{' '}
              — la API en el puerto 3000
            </p>
            <p>
              3. <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env</code> —
              que <code>TRACCAR_API_TOKEN</code> tenga un token válido
            </p>
          </div>
          <button
            type="button"
            onClick={recargar}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="superficie flex h-dvh flex-col">
      <BarraFlota
        unidades={unidades}
        enVivo={enVivo}
        oscuro={oscuro}
        onCambiarTema={cambiarTema}
        avisos={
          <CentroAvisos entrantes={eventosEntrantes} onIrAUnidad={irAUnidad} />
        }
      />

      {/* Pestanas de nivel superior */}
      <nav className="borde panel flex shrink-0 gap-1 border-b px-4" aria-label="Secciones">
        {([
          { id: 'mapa', etiqueta: 'Mapa en vivo' },
          { id: 'historial', etiqueta: 'Historial' },
          { id: 'mantenimientos', etiqueta: 'Mantenimientos' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setVista(t.id);
            }}
            aria-current={vista === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              vista === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'texto-suave border-transparent hover:border-black/15 dark:hover:border-white/20'
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </nav>

      {vista === 'mantenimientos' ? (
        <PanelMantenimientos unidades={unidades} />
      ) : vista === 'historial' ? (
        <div className="flex min-h-0 flex-1">
          <div className="borde w-full max-w-lg shrink-0 border-r md:w-[26rem]">
            <PanelHistorial
              unidades={unidades}
              seleccionada={seleccionada}
              onRecorrido={mostrarRecorrido}
            />
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <MapaEnVivo
              unidades={unidades}
              seleccionada={seleccionada}
              onSeleccionar={setSeleccionada}
              onRenombrar={renombrar}
              onCambiarIcono={cambiarIcono}
              oscuro={oscuro}
              mostrarNombres={false}
              geocercas={geocercas}
              dibujando={null}
              onPuntoDibujado={agregarPunto}
              puntosDibujo={[]}
              anilloPrevio={null}
              encuadrar={null}
              capa={capa}
              recorrido={recorrido}
            />
          </div>
        </div>
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {/* Panel lateral. En pantallas chicas se convierte en un cajon. */}
        <aside
          className={`borde panel absolute inset-y-0 left-0 z-20 w-80 border-r transition-transform
                      md:relative md:translate-x-0 ${
                        panelAbierto ? 'translate-x-0 sombra-alta' : '-translate-x-full'
                      }`}
        >
          <div className="flex h-full flex-col">
            <nav className="borde flex shrink-0 border-b" aria-label="Panel lateral">
              {([
                { id: 'unidades', etiqueta: `Unidades (${String(unidades.length)})` },
                { id: 'zonas', etiqueta: `Zonas (${String(geocercas.length)})` },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPestanaLateral(t.id);
                  }}
                  aria-current={pestanaLateral === t.id ? 'true' : undefined}
                  className={`-mb-px flex-1 border-b-2 px-2 py-2 text-xs font-medium transition ${
                    pestanaLateral === t.id
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'texto-suave border-transparent hover:border-black/15 dark:hover:border-white/20'
                  }`}
                >
                  {t.etiqueta}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1">
              {pestanaLateral === 'zonas' ? (
                <PanelGeocercas
                  geocercas={geocercas}
                  unidades={unidades}
                  modo={modoDibujo}
                  puntos={puntosDibujo}
                  onCambiarModo={setModoDibujo}
                  onLimpiarPuntos={limpiarPuntos}
                  onQuitarUltimoPunto={quitarUltimoPunto}
                  onRecargar={recargarGeocercas}
                  onCentrarEn={centrarEnAnillo}
                />
              ) : carga === 'cargando' ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-black/8 dark:bg-white/10" />
                      <div className="h-2.5 w-1/2 rounded bg-black/6 dark:bg-white/6" />
                    </div>
                  ))}
                </div>
              ) : (
                <PanelUnidades
                  unidades={unidades}
                  seleccionada={seleccionada}
                  onSeleccionar={seleccionar}
                />
              )}
            </div>
          </div>
        </aside>

        {/* Velo para cerrar el cajon en movil */}
        {panelAbierto && (
          <button
            type="button"
            aria-label="Cerrar lista de unidades"
            onClick={() => {
              setPanelAbierto(false);
            }}
            className="absolute inset-0 z-10 bg-black/40 md:hidden"
          />
        )}

        <main className="relative min-w-0 flex-1">
          <MapaEnVivo
            unidades={unidades}
            seleccionada={seleccionada}
            onSeleccionar={setSeleccionada}
            onRenombrar={renombrar}
            onCambiarIcono={cambiarIcono}
            oscuro={oscuro}
            mostrarNombres={mostrarNombres}
            geocercas={geocercas}
            dibujando={modoDibujo}
            onPuntoDibujado={agregarPunto}
            puntosDibujo={puntosDibujo}
            anilloPrevio={anilloPrevio}
            encuadrar={encuadre}
            capa={capa}
            recorrido={recorrido}
          />

          {/* Controles sobre el mapa */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPanelAbierto(true);
              }}
              className="borde panel rounded-lg border px-3 py-2 text-sm font-medium
                         sombra-suave md:hidden"
            >
              Unidades ({unidades.length})
            </button>

            <div className="borde panel flex overflow-hidden rounded-lg border sombra-suave">
              {(Object.keys(CAPAS) as CapaMapa[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCapa(c);
                    try {
                      localStorage.setItem('capaMapa', c);
                    } catch {
                      // En modo privado no se recuerda. Aceptable.
                    }
                  }}
                  aria-pressed={capa === c}
                  className={`px-2.5 py-2 text-xs font-medium transition ${
                    capa === c
                      ? 'bg-indigo-600 text-white'
                      : 'texto-suave hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {CAPAS[c].etiqueta}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={cambiarNombres}
              aria-pressed={mostrarNombres}
              title={
                mostrarNombres
                  ? 'Ocultar los nombres y dejar solo el ícono'
                  : 'Mostrar el nombre de cada unidad'
              }
              className={`borde panel flex items-center gap-1.5 rounded-lg border px-2.5 py-2
                          text-xs font-medium sombra-suave transition ${
                            mostrarNombres ? '' : 'texto-suave'
                          }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
              </svg>
              Nombres
            </button>
          </div>

          {unidadSeleccionada !== null && (
            <FichaUnidad
              unidad={unidadSeleccionada}
              ficha={fichaSeleccionada}
              onCerrar={() => {
                setSeleccionada(null);
              }}
              onEditarFicha={() => {
                setEditandoFicha(unidadSeleccionada.id);
              }}
              onComandos={() => {
                setComandosDe(unidadSeleccionada.id);
              }}
            />
          )}

          {/* Estado vacío: el simulador no está corriendo */}
          {carga === 'listo' && unidades.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="borde panel pointer-events-auto max-w-sm rounded-2xl border p-5 text-center sombra-alta">
                <h2 className="mb-1 text-sm font-semibold">No hay unidades todavía</h2>
                <p className="texto-suave mb-3 text-sm">
                  Arranca el simulador para ver una flota moviéndose.
                </p>
                <code className="block rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/10">
                  pnpm simulate --units 10 --city cdmx
                </code>
              </div>
            </div>
          )}
        </main>
      </div>
      )}

      {unidadComandos !== null && (
        <PanelComandos
          unidad={unidadComandos}
          onCerrar={() => {
            setComandosDe(null);
          }}
        />
      )}

      {unidadEditando !== null && (
        <FichaVehiculo
          unidad={unidadEditando}
          ficha={fichas.get(unidadEditando.id) ?? null}
          onCerrar={() => {
            setEditandoFicha(null);
          }}
          onGuardada={(ficha) => {
            setFichas((previas) => new Map(previas).set(ficha.deviceId, ficha));
          }}
        />
      )}
    </div>
  );
}
