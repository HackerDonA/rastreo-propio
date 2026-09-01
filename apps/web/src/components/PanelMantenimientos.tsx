/**
 * Vista de mantenimientos de toda la flota.
 *
 * Diseñada para ver de un golpe qué necesita servicio, no para consultar
 * vehículo por vehículo: con diez unidades y tres reglas cada una son treinta
 * filas, y lo urgente tiene que salir arriba solo.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';

import {
  aplicarPlantilla,
  borrarPlantilla,
  borrarRegla,
  CLASES_NIVEL,
  COLOR_BARRA,
  crearPlantilla,
  ETIQUETA_DIMENSION,
  ETIQUETA_NIVEL,
  obtenerPanel,
  obtenerPlantillas,
  registrarServicio,
  type NivelAviso,
  type Plantilla,
  type ReglaEvaluada,
  type ResumenMantenimientos,
} from '../lib/mantenimientos.ts';
import type { Unit } from '../lib/tipos.ts';
import { IconoVehiculo } from './IconoVehiculo.tsx';

type Filtro = NivelAviso | 'todos';

interface Props {
  readonly unidades: readonly Unit[];
}

export function PanelMantenimientos({ unidades }: Props): JSX.Element {
  const [reglas, setReglas] = useState<readonly ReglaEvaluada[]>([]);
  const [resumen, setResumen] = useState<ResumenMantenimientos | null>(null);
  const [plantillas, setPlantillas] = useState<readonly Plantilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [dialogo, setDialogo] = useState<'ninguno' | 'plantilla' | 'aplicar' | 'servicio'>(
    'ninguno',
  );
  const [reglaActiva, setReglaActiva] = useState<ReglaEvaluada | null>(null);
  const [plantillaActiva, setPlantillaActiva] = useState<Plantilla | null>(null);

  const recargar = useCallback(async (): Promise<void> => {
    try {
      const [panel, tpl] = await Promise.all([obtenerPanel(), obtenerPlantillas()]);
      setReglas(panel.rules);
      setResumen(panel.summary);
      setPlantillas(tpl);
      setError(null);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'Error desconocido');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // `recargar` es asincrona: todos sus setState ocurren DESPUES del primer
    // await, asi que no hay render en cascada. La regla no puede distinguirlo
    // y marca cualquier llamada en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar();
    // Se refresca cada minuto: el progreso avanza conforme los vehículos
    // acumulan kilómetros, pero no tan rápido como para justificar un WebSocket.
    const t = setInterval(() => {
      void recargar();
    }, 60_000);
    return () => {
      clearInterval(t);
    };
  }, [recargar]);

  const visibles = useMemo(
    () => (filtro === 'todos' ? reglas : reglas.filter((r) => r.nivel === filtro)),
    [reglas, filtro],
  );

  if (cargando) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="animate-pulse space-y-2">
            <div className="h-4 w-1/3 rounded bg-black/8 dark:bg-white/10" />
            <div className="h-2 w-full rounded bg-black/6 dark:bg-white/6" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="scroll-fino h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {error !== null && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 ring-1 ring-red-500/25 ring-inset dark:text-red-400">
            {error}
          </div>
        )}

        {/* ---------- Indicadores ---------- */}
        {resumen !== null && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tarjeta etiqueta="Vencidos" valor={resumen.overdue} color="#dc2626" />
            <Tarjeta etiqueta="Por vencer" valor={resumen.dueSoon} color="#d97706" />
            <Tarjeta etiqueta="Al día" valor={resumen.ok} color="#16a34a" />
            <Tarjeta etiqueta="Reglas activas" valor={resumen.total} />
          </div>
        )}

        {/* ---------- Barra de acciones ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['todos', 'overdue', 'due_soon', 'ok'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFiltro(f);
                }}
                aria-pressed={filtro === f}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  filtro === f
                    ? 'bg-blue-600 text-white'
                    : 'borde texto-suave border hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {f === 'todos' ? 'Todos' : ETIQUETA_NIVEL[f]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setDialogo('plantilla');
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            + Nueva plantilla
          </button>
        </div>

        {/* ---------- Plantillas ---------- */}
        <section>
          <h2 className="texto-suave mb-2 text-[11px] font-semibold tracking-wide uppercase">
            Plantillas · defínelas una vez y aplícalas a la flota
          </h2>
          {plantillas.length === 0 ? (
            <div className="borde panel rounded-lg border border-dashed p-6 text-center">
              <p className="mb-1 text-sm font-medium">Todavía no hay plantillas</p>
              <p className="texto-suave text-xs">
                Una plantilla como &ldquo;aceite cada 5,000 km&rdquo; se define una vez y se
                aplica a las diez unidades de golpe.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plantillas.map((p) => (
                <div key={p.id} className="borde panel rounded-lg border p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void borrarPlantilla(p.id).then(recargar).catch(() => {
                          setError('No se pudo borrar la plantilla');
                        });
                      }}
                      aria-label={`Borrar plantilla ${p.name}`}
                      className="texto-suave shrink-0 rounded p-0.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <p className="texto-suave mb-2 text-xs">
                    {[
                      p.intervalKm === null
                        ? null
                        : `cada ${p.intervalKm.toLocaleString('es-MX')} km`,
                      p.intervalDays === null ? null : `cada ${String(p.intervalDays)} días`,
                      p.intervalEngineHours === null
                        ? null
                        : `cada ${String(p.intervalEngineHours)} h motor`,
                    ]
                      .filter((x) => x !== null)
                      .join(' · ')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="texto-suave text-[11px]">
                      {p.appliedCount} unidad{p.appliedCount === 1 ? '' : 'es'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPlantillaActiva(p);
                        setDialogo('aplicar');
                      }}
                      className="borde rounded-md border px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      Aplicar a unidades
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Reglas ---------- */}
        <section>
          <h2 className="texto-suave mb-2 text-[11px] font-semibold tracking-wide uppercase">
            Progreso por unidad
          </h2>

          {visibles.length === 0 ? (
            <div className="borde panel rounded-lg border border-dashed p-8 text-center">
              <p className="mb-1 text-sm font-medium">
                {reglas.length === 0 ? 'Ninguna unidad tiene mantenimientos' : 'Nada en este filtro'}
              </p>
              <p className="texto-suave text-xs">
                {reglas.length === 0
                  ? 'Crea una plantilla y aplícala a la flota.'
                  : 'Prueba con otro filtro.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibles.map((r) => (
                <FilaRegla
                  key={r.ruleId}
                  regla={r}
                  onServicio={() => {
                    setReglaActiva(r);
                    setDialogo('servicio');
                  }}
                  onBorrar={() => {
                    void borrarRegla(r.ruleId).then(recargar).catch(() => {
                      setError('No se pudo dar de baja la regla');
                    });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- Diálogos ---------- */}
      {dialogo === 'plantilla' && (
        <DialogoPlantilla
          onCerrar={() => {
            setDialogo('ninguno');
          }}
          onGuardado={() => {
            setDialogo('ninguno');
            void recargar();
          }}
        />
      )}

      {dialogo === 'aplicar' && plantillaActiva !== null && (
        <DialogoAplicar
          plantilla={plantillaActiva}
          unidades={unidades}
          onCerrar={() => {
            setDialogo('ninguno');
          }}
          onAplicado={() => {
            setDialogo('ninguno');
            void recargar();
          }}
        />
      )}

      {dialogo === 'servicio' && reglaActiva !== null && (
        <DialogoServicio
          regla={reglaActiva}
          onCerrar={() => {
            setDialogo('ninguno');
          }}
          onGuardado={() => {
            setDialogo('ninguno');
            void recargar();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
//  Piezas
// ============================================================================

function Tarjeta({
  etiqueta,
  valor,
  color,
}: {
  readonly etiqueta: string;
  readonly valor: number;
  readonly color?: string;
}): JSX.Element {
  return (
    <div className="borde panel rounded-lg border p-3">
      <div className="texto-suave text-[10px] tracking-wide uppercase">{etiqueta}</div>
      <div
        className="text-2xl leading-tight font-semibold tabular-nums"
        style={color === undefined ? undefined : { color }}
      >
        {valor}
      </div>
    </div>
  );
}

function FilaRegla({
  regla,
  onServicio,
  onBorrar,
}: {
  readonly regla: ReglaEvaluada;
  readonly onServicio: () => void;
  readonly onBorrar: () => void;
}): JSX.Element {
  return (
    <div className="borde panel rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="texto-suave shrink-0">
            <IconoVehiculo categoria={regla.deviceCategory} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{regla.deviceName}</div>
            <div className="texto-suave truncate text-xs">{regla.name}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
              CLASES_NIVEL[regla.nivel]
            }`}
          >
            {ETIQUETA_NIVEL[regla.nivel]}
          </span>
          <button
            type="button"
            onClick={onServicio}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-blue-700"
          >
            Registrar servicio
          </button>
          <button
            type="button"
            onClick={onBorrar}
            aria-label={`Dar de baja ${regla.name} en ${regla.deviceName}`}
            className="texto-suave rounded p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${COLOR_BARRA[regla.nivel]}`}
          style={{ width: `${String(Math.round(regla.avance * 100))}%` }}
        />
      </div>

      <div className="texto-suave flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-medium">{regla.mensaje}</span>
        {regla.dimension !== null && <span>· por {ETIQUETA_DIMENSION[regla.dimension]}</span>}
        {regla.dimensiones.length > 1 && (
          <span>· lo que ocurra primero de {regla.dimensiones.length}</span>
        )}
        {regla.lastServiceAt !== null && (
          <span>· último servicio {new Date(regla.lastServiceAt).toLocaleDateString('es-MX')}</span>
        )}
        {regla.sinDatos && (
          <span className="text-amber-600 dark:text-amber-400">
            · la unidad aún no reporta odómetro
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  Diálogos
// ============================================================================

function Modal({
  titulo,
  children,
  onCerrar,
}: {
  readonly titulo: string;
  readonly children: JSX.Element;
  readonly onCerrar: () => void;
}): JSX.Element {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
    };
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="borde panel max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{titulo}</h3>
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
        {children}
      </div>
    </div>
  );
}

const claseCampo =
  'borde panel w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50';
const claseEtiqueta = 'texto-suave mb-1 block text-[11px] font-medium';

function DialogoPlantilla({
  onCerrar,
  onGuardado,
}: {
  readonly onCerrar: () => void;
  readonly onGuardado: () => void;
}): JSX.Element {
  const [nombre, setNombre] = useState('');
  const [km, setKm] = useState('');
  const [dias, setDias] = useState('');
  const [horas, setHoras] = useState('');
  const [avisoKm, setAvisoKm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numero = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? undefined : n;
  };

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        name: nombre.trim(),
        ...(numero(km) === undefined ? {} : { intervalKm: numero(km) }),
        ...(numero(dias) === undefined ? {} : { intervalDays: numero(dias) }),
        ...(numero(horas) === undefined ? {} : { intervalEngineHours: numero(horas) }),
        ...(numero(avisoKm) === undefined ? {} : { noticeKm: numero(avisoKm) }),
      };
      await crearPlantilla(datos as Parameters<typeof crearPlantilla>[0]);
      onGuardado();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Nueva plantilla de mantenimiento" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div>
          <label className={claseEtiqueta} htmlFor="tpl-nombre">
            Nombre
          </label>
          <input
            id="tpl-nombre"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
            }}
            placeholder="Cambio de aceite"
            className={claseCampo}
          />
        </div>

        <p className="texto-suave text-[11px]">
          Configura uno o varios intervalos. Con más de uno, gana{' '}
          <strong>lo que ocurra primero</strong>.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={claseEtiqueta} htmlFor="tpl-km">
              Cada … km
            </label>
            <input
              id="tpl-km"
              type="number"
              inputMode="numeric"
              value={km}
              onChange={(e) => {
                setKm(e.target.value);
              }}
              placeholder="5000"
              className={claseCampo}
            />
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="tpl-dias">
              Cada … días
            </label>
            <input
              id="tpl-dias"
              type="number"
              inputMode="numeric"
              value={dias}
              onChange={(e) => {
                setDias(e.target.value);
              }}
              placeholder="180"
              className={claseCampo}
            />
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="tpl-horas">
              Cada … h motor
            </label>
            <input
              id="tpl-horas"
              type="number"
              inputMode="numeric"
              value={horas}
              onChange={(e) => {
                setHoras(e.target.value);
              }}
              placeholder="250"
              className={claseCampo}
            />
          </div>
        </div>

        <div>
          <label className={claseEtiqueta} htmlFor="tpl-aviso">
            Avisar … km antes
          </label>
          <input
            id="tpl-aviso"
            type="number"
            inputMode="numeric"
            value={avisoKm}
            onChange={(e) => {
              setAvisoKm(e.target.value);
            }}
            placeholder="500"
            className={claseCampo}
          />
          <p className="texto-suave mt-1 text-[10px]">
            Si lo dejas vacío se usa el 10 % del intervalo.
          </p>
        </div>

        {error !== null && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={guardando || nombre.trim() === ''}
            onClick={() => {
              void guardar();
            }}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Crear plantilla'}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="borde texto-suave rounded-md border px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DialogoAplicar({
  plantilla,
  unidades,
  onCerrar,
  onAplicado,
}: {
  readonly plantilla: Plantilla;
  readonly unidades: readonly Unit[];
  readonly onCerrar: () => void;
  readonly onAplicado: () => void;
}): JSX.Element {
  const [seleccion, setSeleccion] = useState<ReadonlySet<number>>(
    () => new Set(unidades.map((u) => u.id)),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: number): void => {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const aplicar = async (): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      await aplicarPlantilla(plantilla.id, [...seleccion]);
      onAplicado();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo aplicar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Aplicar «${plantilla.name}»`} onCerrar={onCerrar}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="texto-suave text-xs">
            {seleccion.size} de {unidades.length} unidades
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSeleccion(new Set(unidades.map((u) => u.id)));
              }}
              className="borde rounded border px-2 py-0.5 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => {
                setSeleccion(new Set());
              }}
              className="borde rounded border px-2 py-0.5 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              Ninguna
            </button>
          </div>
        </div>

        <div className="borde scroll-fino max-h-64 overflow-y-auto rounded-md border">
          {unidades.map((u) => (
            <label
              key={u.id}
              className="borde flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={seleccion.has(u.id)}
                onChange={() => {
                  alternar(u.id);
                }}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <span className="texto-suave shrink-0">
                <IconoVehiculo categoria={u.category} className="h-4 w-4" />
              </span>
              <span className="truncate">{u.name}</span>
            </label>
          ))}
        </div>

        <p className="texto-suave text-[11px]">
          La cuenta arranca desde el odómetro actual de cada unidad, así que ninguna aparece
          vencida el primer día. Aplicarla dos veces no duplica nada.
        </p>

        {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={guardando || seleccion.size === 0}
            onClick={() => {
              void aplicar();
            }}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Aplicando…' : `Aplicar a ${String(seleccion.size)} unidades`}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="borde texto-suave rounded-md border px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DialogoServicio({
  regla,
  onCerrar,
  onGuardado,
}: {
  readonly regla: ReglaEvaluada;
  readonly onCerrar: () => void;
  readonly onGuardado: () => void;
}): JSX.Element {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [costo, setCosto] = useState('');
  const [taller, setTaller] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      const costoNum = Number(costo);
      await registrarServicio(regla.ruleId, {
        // El input date da solo la fecha; se manda como instante ISO completo.
        performedAt: new Date(`${fecha}T12:00:00`).toISOString(),
        ...(costo.trim() === '' || !Number.isFinite(costoNum) ? {} : { cost: costoNum }),
        ...(taller.trim() === '' ? {} : { vendor: taller.trim() }),
        ...(notas.trim() === '' ? {} : { notes: notas.trim() }),
      });
      onGuardado();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Registrar servicio" onCerrar={onCerrar}>
      <div className="space-y-3">
        <div className="borde rounded-md border p-2.5">
          <p className="text-sm font-medium">{regla.deviceName}</p>
          <p className="texto-suave text-xs">
            {regla.name} · {regla.mensaje}
          </p>
        </div>

        <div>
          <label className={claseEtiqueta} htmlFor="sv-fecha">
            Fecha del servicio
          </label>
          <input
            id="sv-fecha"
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
            }}
            className={claseCampo}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={claseEtiqueta} htmlFor="sv-costo">
              Costo (MXN)
            </label>
            <input
              id="sv-costo"
              type="number"
              inputMode="decimal"
              value={costo}
              onChange={(e) => {
                setCosto(e.target.value);
              }}
              placeholder="1250"
              className={claseCampo}
            />
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="sv-taller">
              Taller
            </label>
            <input
              id="sv-taller"
              value={taller}
              onChange={(e) => {
                setTaller(e.target.value);
              }}
              placeholder="Taller Norte"
              className={claseCampo}
            />
          </div>
        </div>

        <div>
          <label className={claseEtiqueta} htmlFor="sv-notas">
            Notas
          </label>
          <textarea
            id="sv-notas"
            value={notas}
            rows={2}
            onChange={(e) => {
              setNotas(e.target.value);
            }}
            placeholder="Aceite 15W40 y filtro"
            className={claseCampo}
          />
        </div>

        <p className="texto-suave text-[11px]">
          El odómetro se toma de la lectura actual de la unidad, y el contador de esta regla
          vuelve a empezar desde ahí.
        </p>

        {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => {
              void guardar();
            }}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Registrar servicio'}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="borde texto-suave rounded-md border px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
