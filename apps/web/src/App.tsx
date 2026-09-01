import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import { actualizarUnidad } from './lib/api.ts';
import { BarraFlota } from './components/BarraFlota.tsx';
import { FichaUnidad } from './components/FichaUnidad.tsx';
import { MapaEnVivo } from './components/MapaEnVivo.tsx';
import { PanelMantenimientos } from './components/PanelMantenimientos.tsx';
import { PanelUnidades } from './components/PanelUnidades.tsx';
import { useFlota } from './lib/useFlota.ts';
import type { Categoria } from './lib/vehiculos.ts';

type Vista = 'mapa' | 'mantenimientos';

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
  const { unidades, carga, error, enVivo, recargar, aplicarUnidad } = useFlota();
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [oscuro, setOscuro] = useState(temaInicial);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [mostrarNombres, setMostrarNombres] = useState(nombresIniciales);
  const [vista, setVista] = useState<Vista>('mapa');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro);
    try {
      localStorage.setItem('tema', oscuro ? 'oscuro' : 'claro');
    } catch {
      // En modo privado localStorage puede lanzar. El tema simplemente no se
      // recuerda entre sesiones, que es una degradacion aceptable.
    }
  }, [oscuro]);

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

  const unidadSeleccionada = unidades.find((u) => u.id === seleccionada) ?? null;

  // --- Error de carga -------------------------------------------------------
  if (carga === 'error') {
    return (
      <div className="superficie flex h-dvh items-center justify-center p-6">
        <div className="borde panel max-w-md rounded-xl border p-6 text-center">
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
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
      />

      {/* Pestanas de nivel superior */}
      <nav className="borde panel flex shrink-0 gap-1 border-b px-4" aria-label="Secciones">
        {([
          { id: 'mapa', etiqueta: 'Mapa en vivo' },
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
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'texto-suave border-transparent hover:border-black/15 dark:hover:border-white/20'
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </nav>

      {vista === 'mantenimientos' ? (
        <PanelMantenimientos unidades={unidades} />
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {/* Panel lateral. En pantallas chicas se convierte en un cajon. */}
        <aside
          className={`borde panel absolute inset-y-0 left-0 z-20 w-80 border-r transition-transform
                      md:relative md:translate-x-0 ${
                        panelAbierto ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
                      }`}
        >
          {carga === 'cargando' ? (
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
          />

          {/* Controles sobre el mapa */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPanelAbierto(true);
              }}
              className="borde panel rounded-lg border px-3 py-2 text-sm font-medium
                         shadow-lg md:hidden"
            >
              Unidades ({unidades.length})
            </button>

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
                          text-xs font-medium shadow-lg transition ${
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
              onCerrar={() => {
                setSeleccionada(null);
              }}
            />
          )}

          {/* Estado vacío: el simulador no está corriendo */}
          {carga === 'listo' && unidades.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="borde panel pointer-events-auto max-w-sm rounded-xl border p-5 text-center shadow-xl">
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
    </div>
  );
}
