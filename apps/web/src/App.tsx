import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import { actualizarUnidad, API_URL } from './lib/api.ts';
import {
  obtenerFichas,
  obtenerGeocercas,
  type Ficha,
  type Geocerca,
  type PuntoHistorial,
} from './lib/flota-api.ts';
import { BarraFlota } from './components/BarraFlota.tsx';
import { BarraInferior } from './components/BarraInferior.tsx';
import { HojaMovil } from './components/HojaMovil.tsx';
import { CentroAvisos } from './components/CentroAvisos.tsx';
import { FichaVehiculo } from './components/FichaVehiculo.tsx';
import { PanelComandos } from './components/PanelComandos.tsx';
import { PanelCompartir } from './components/PanelCompartir.tsx';
import { PanelGeocercas, type ModoDibujo } from './components/PanelGeocercas.tsx';
import { PanelHistorial } from './components/PanelHistorial.tsx';
import { FichaUnidad } from './components/FichaUnidad.tsx';
import { CAPAS, MapaEnVivo, type CapaMapa } from './components/MapaEnVivo.tsx';
import { PanelMantenimientos } from './components/PanelMantenimientos.tsx';
import { PanelUnidades } from './components/PanelUnidades.tsx';
import { useEsMovil } from './lib/media.ts';
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
  const esMovil = useEsMovil();
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
  const [compartirDe, setCompartirDe] = useState<number | null>(null);
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

  // Resumen de la flota para la hoja de movil. Son tres filtros sobre un
  // arreglo de diez elementos: memorizarlos costaria mas que recalcularlos.
  const enMovimiento = unidades.filter((u) => u.state === 'moving').length;
  const detenidas = unidades.filter((u) => u.state === 'stopped').length;
  const sinSenal = unidades.filter(
    (u) => u.state === 'offline' || u.state === 'unknown',
  ).length;

  const unidadSeleccionada = unidades.find((u) => u.id === seleccionada) ?? null;
  const fichaSeleccionada =
    seleccionada === null ? null : (fichas.get(seleccionada) ?? null);
  const unidadEditando =
    editandoFicha === null ? null : (unidades.find((u) => u.id === editandoFicha) ?? null);
  const unidadComandos =
    comandosDe === null ? null : (unidades.find((u) => u.id === comandosDe) ?? null);
  const unidadCompartir =
    compartirDe === null ? null : (unidades.find((u) => u.id === compartirDe) ?? null);

  /*
   * Contenido del panel de unidades y zonas.
   *
   * Se declara una sola vez porque es identico en las dos plataformas; lo que
   * cambia es el envoltorio: un panel fijo a la izquierda en escritorio, una
   * hoja arrastrable desde abajo en telefono.
   */
  const pestanasPanel = (
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
          className={`toque -mb-px flex-1 border-b-2 px-2 text-xs font-medium transition ${
            pestanaLateral === t.id
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'texto-suave border-transparent hover:border-black/15 dark:hover:border-white/20'
          }`}
        >
          {t.etiqueta}
        </button>
      ))}
    </nav>
  );

  const cuerpoPanel =
    pestanaLateral === 'zonas' ? (
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
    );

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
              <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
                .\iniciar.ps1
              </code>{' '}
              — la API debe responder en{' '}
              <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
                {API_URL}/health
              </code>
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
      {/*
        En un telefono las tres pestanas no caben a la vez, asi que la barra se
        desliza en horizontal. `scrollbar-none` quita la barra de
        desplazamiento, que en movil no hace falta y en escritorio robaria
        altura a un elemento de 44 px.
      */}
      {/*
        Pestanas de arriba: SOLO escritorio. En telefono esta navegacion vive
        en la barra inferior, al alcance del pulgar. Ver BarraInferior.tsx.
      */}
      <nav
        className="borde panel segura-lados hidden shrink-0 gap-1 overflow-x-auto border-b px-3 [scrollbar-width:none] sm:px-4 md:flex [&::-webkit-scrollbar]:hidden"
        aria-label="Secciones"
      >
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
            className={`toque -mb-px shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition ${
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
        {/*
          Panel lateral. SOLO escritorio.

          En telefono este mismo contenido va dentro de una hoja que sube desde
          abajo, mas abajo en este archivo. No es el mismo panel con otro CSS:
          la hoja se arrastra, atrapa el foco y tiene su propio encabezado, asi
          que son dos arboles distintos y se monta uno u otro segun la pantalla.
        */}
        <aside className="borde panel hidden w-80 shrink-0 border-r md:block">
          <div className="flex h-full flex-col">
            {pestanasPanel}

            <div className="min-h-0 flex-1">
              {cuerpoPanel}
            </div>
          </div>
        </aside>

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

          {/*
            Controles sobre el mapa.

            En un telefono estos controles compiten con el mapa por el unico
            recurso escaso que hay: la pantalla. Con las etiquetas completas la
            fila mide unos 470 px y un iPhone tiene 390, asi que se salia por
            la derecha y ademas tapaba una franja del mapa.

            Por eso en pantallas chicas todo va en iconos y el selector de capa
            pasa a ser un <select> nativo: el sistema operativo lo abre en una
            rueda a pantalla completa, con objetivos tactiles enormes y sin una
            linea de codigo de menu propio. A partir de `sm` vuelven los
            botones con texto, que en un raton se leen de un vistazo.
          */}
          <div className="segura-lados absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 sm:top-4 sm:left-4">
            <button
              type="button"
              onClick={() => {
                setPanelAbierto(true);
              }}
              aria-label={`Ver las ${String(unidades.length)} unidades`}
              className="toque borde panel flex items-center gap-1.5 rounded-lg border px-2.5
                         text-sm font-medium sombra-suave md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
              {unidades.length}
            </button>

            {/* Selector de capa: rueda nativa en movil */}
            <select
              value={capa}
              onChange={(e) => {
                const c = e.target.value as CapaMapa;
                setCapa(c);
                try {
                  localStorage.setItem('capaMapa', c);
                } catch {
                  // En modo privado no se recuerda. Aceptable.
                }
              }}
              aria-label="Capa del mapa"
              className="toque borde panel rounded-lg border px-2.5 text-xs font-medium sombra-suave sm:hidden"
            >
              {(Object.keys(CAPAS) as CapaMapa[]).map((c) => (
                <option key={c} value={c}>
                  {CAPAS[c].etiqueta}
                </option>
              ))}
            </select>

            {/* Selector de capa: botones en pantallas grandes */}
            <div className="borde panel hidden overflow-hidden rounded-lg border sombra-suave sm:flex">
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
              aria-label={
                mostrarNombres ? 'Ocultar los nombres' : 'Mostrar los nombres'
              }
              title={
                mostrarNombres
                  ? 'Ocultar los nombres y dejar solo el ícono'
                  : 'Mostrar el nombre de cada unidad'
              }
              className={`toque borde panel flex items-center gap-1.5 rounded-lg border px-2.5
                          text-xs font-medium sombra-suave transition ${
                            mostrarNombres ? '' : 'texto-suave'
                          }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Nombres</span>
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
              onCompartir={() => {
                setCompartirDe(unidadSeleccionada.id);
              }}
            />
          )}

          {/* Estado vacío: el simulador no está corriendo */}
          {carga === 'listo' && unidades.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="borde panel pointer-events-auto max-w-sm rounded-2xl border p-5 text-center sombra-alta">
                <h2 className="mb-1 text-sm font-semibold">No hay unidades todavía</h2>
                <p className="texto-suave mb-3 text-sm">
                  Aún no hay ningún GPS reportando. Para ver una flota de prueba
                  moviéndose, arranca el simulador:
                </p>
                <code className="block rounded-lg bg-black/5 px-3 py-2 text-xs break-all dark:bg-white/10">
                  .\iniciar.ps1
                </code>
              </div>
            </div>
          )}
        </main>

        {/*
          La misma lista, en el envoltorio que corresponde al telefono. Se monta
          solo en movil: tener las dos a la vez duplicaria los `aria-label` y
          dejaria botones invisibles al alcance del lector de pantalla.
        */}
        {esMovil && (
          <HojaMovil
            abierta={panelAbierto}
            onCerrar={() => {
              setPanelAbierto(false);
            }}
            titulo={pestanaLateral === 'zonas' ? 'Zonas' : 'Unidades'}
          >
            <div className="flex h-full flex-col">
              {/*
                Resumen de la flota. En escritorio vive en la barra de arriba;
                aqui recupera su sitio, y ademas es el correcto: se consulta al
                abrir la lista, no mirando el mapa.
              */}
              {pestanaLateral === 'unidades' && (
                <div className="borde flex shrink-0 gap-2 border-b px-4 py-2.5 text-xs">
                  {(
                    [
                      { etiqueta: 'En movimiento', valor: enMovimiento, color: '#16a34a' },
                      { etiqueta: 'Detenidas', valor: detenidas, color: '#d97706' },
                      { etiqueta: 'Sin señal', valor: sinSenal, color: '#64748b' },
                    ] as const
                  ).map((c) => (
                    <div
                      key={c.etiqueta}
                      className="panel-suave borde flex-1 rounded-lg border px-2 py-1.5 text-center"
                    >
                      <div
                        className="text-base leading-tight font-semibold tabular-nums"
                        style={{ color: c.color }}
                      >
                        {c.valor}
                      </div>
                      <div className="texto-suave leading-tight">{c.etiqueta}</div>
                    </div>
                  ))}
                </div>
              )}
              {pestanasPanel}
              <div className="min-h-0 flex-1 overflow-y-auto">{cuerpoPanel}</div>
            </div>
          </HojaMovil>
        )}
      </div>
      )}

      {/*
        Navegacion principal del telefono. Va fuera del bloque de cada vista
        porque acompana a las tres, y al final del arbol para quedar por encima
        del mapa sin necesidad de pelear con z-index.
      */}
      <BarraInferior vista={vista} onCambiar={setVista} />

      {unidadCompartir !== null && (
        <PanelCompartir
          unidad={unidadCompartir}
          onCerrar={() => {
            setCompartirDe(null);
          }}
        />
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
