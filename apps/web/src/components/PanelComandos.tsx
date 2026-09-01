/**
 * Comandos remotos hacia un rastreador.
 *
 * La fricción está calibrada por riesgo: los comandos seguros se envían con un
 * clic, y apagar el motor exige escribir la palabra completa. Un botón de corte
 * de motor a un clic de distancia es un accidente esperando su turno.
 */

import { useEffect, useState, type JSX } from 'react';

import {
  enviarComando,
  obtenerComandos,
  type ComandoDisponible,
  type ComandosUnidad,
  type Riesgo,
} from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';

const CLASES_RIESGO: Readonly<Record<Riesgo, string>> = {
  seguro: 'bg-green-500/12 text-green-700 dark:text-green-400 ring-green-500/25',
  cuidado: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  peligroso: 'bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/25',
};

const ETIQUETA_RIESGO: Readonly<Record<Riesgo, string>> = {
  seguro: 'Sin riesgo',
  cuidado: 'Con cuidado',
  peligroso: 'Peligroso',
};

/** La palabra que hay que escribir para confirmar un comando peligroso. */
const PALABRA_CONFIRMACION = 'CONFIRMO';

interface Props {
  readonly unidad: Unit;
  readonly onCerrar: () => void;
}

export function PanelComandos({ unidad, onCerrar }: Props): JSX.Element {
  const [datos, setDatos] = useState<ComandosUnidad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [canal, setCanal] = useState<'datos' | 'sms'>('datos');
  const [elegido, setElegido] = useState<ComandoDisponible | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [parametro, setParametro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    obtenerComandos(unidad.id)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((causa: unknown) => {
        setError(causa instanceof Error ? causa.message : 'No se pudieron cargar');
      })
      .finally(() => {
        setCargando(false);
      });
  }, [unidad.id]);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
    };
  }, [onCerrar]);

  const lista = datos === null ? [] : canal === 'datos' ? datos.viaDatos : datos.viaSms;
  const enMovimiento = datos?.enMovimiento ?? false;

  // Un comando peligroso con el vehículo en marcha requiere las dos cosas:
  // escribir la palabra Y aceptar explícitamente el riesgo del movimiento.
  const bloqueadoPorMovimiento =
    elegido !== null && elegido.riesgo === 'peligroso' && enMovimiento;
  const confirmacionOk =
    elegido === null ||
    elegido.riesgo !== 'peligroso' ||
    confirmacion.trim().toUpperCase() === PALABRA_CONFIRMACION;

  const enviar = async (): Promise<void> => {
    if (elegido === null || !confirmacionOk) return;
    setEnviando(true);
    setError(null);
    setExito(null);
    try {
      const attributes: Record<string, string | number> = {};
      if (elegido.type === 'custom' && parametro.trim() !== '') {
        attributes['data'] = parametro.trim();
      }
      if (elegido.type === 'positionPeriodic' && parametro.trim() !== '') {
        attributes['frequency'] = Number(parametro.trim());
      }

      const r = await enviarComando(unidad.id, {
        type: elegido.type,
        attributes,
        textChannel: canal === 'sms',
        // Solo se manda `true` si la persona ya vio la advertencia del
        // movimiento y aun así decidió continuar.
        confirmarEnMovimiento: bloqueadoPorMovimiento,
      });
      setExito(r.nota);
      setElegido(null);
      setConfirmacion('');
      setParametro('');
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="borde panel scroll-fino aparecer max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border p-5 sombra-alta">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">Comandos remotos</h3>
            <p className="texto-suave truncate text-xs">{unidad.name}</p>
          </div>
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

        {/* ---------- Estado del vehículo ---------- */}
        {datos !== null && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${
              enMovimiento
                ? 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-400'
                : 'bg-green-500/12 text-green-700 ring-green-500/25 dark:text-green-400'
            }`}
          >
            {enMovimiento ? (
              <>
                <strong>El vehículo va en movimiento</strong>
                {datos.velocidadKmh !== null && ` (${String(Math.round(datos.velocidadKmh))} km/h)`}
                . Los comandos peligrosos están bloqueados.
              </>
            ) : (
              <>
                <strong>El vehículo está detenido.</strong> Es seguro operar.
              </>
            )}
          </div>
        )}

        {cargando && <p className="texto-suave py-6 text-center text-sm">Consultando…</p>}

        {/* ---------- Equipo sin soporte de comandos ---------- */}
        {datos?.soloCustom === true && (
          <div className="borde mb-3 rounded-lg border border-dashed p-3">
            <p className="mb-1 text-sm font-medium">Este equipo no acepta comandos</p>
            <p className="texto-suave text-xs">
              Su protocolo no define comandos remotos. Es el caso de las unidades simuladas y
              de la app Traccar Client, que usan el protocolo OsmAnd. Un rastreador real
              (GT06, H02, Teltonika…) sí mostrará aquí la lista completa.
            </p>
          </div>
        )}

        {datos !== null && !cargando && (
          <>
            {/* ---------- Canal ---------- */}
            <div className="mb-3">
              <p className="texto-suave mb-1 text-xs font-medium">Enviar por</p>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: 'datos', etiqueta: 'Datos', nota: 'gratis, requiere estar en línea' },
                    { id: 'sms', etiqueta: 'SMS', nota: 'funciona sin datos, cuesta un mensaje' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCanal(c.id);
                      setElegido(null);
                    }}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                      canal === c.id
                        ? 'bg-indigo-600 text-white'
                        : 'borde texto-suave border hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    title={c.nota}
                  >
                    {c.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {/* ---------- Lista de comandos ---------- */}
            {lista.length === 0 ? (
              <p className="texto-suave py-4 text-center text-sm">
                Sin comandos disponibles por este canal.
              </p>
            ) : (
              <div className="borde scroll-fino mb-3 max-h-64 overflow-y-auto rounded-lg border">
                {lista.map((c) => {
                  const bloqueado = c.riesgo === 'peligroso' && enMovimiento;
                  const activo = elegido?.type === c.type;
                  return (
                    <button
                      key={c.type}
                      type="button"
                      onClick={() => {
                        setElegido(activo ? null : c);
                        setConfirmacion('');
                        setParametro('');
                        setExito(null);
                      }}
                      className={`borde block w-full border-b px-3 py-2.5 text-left transition last:border-b-0 ${
                        activo
                          ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30 ring-inset'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium">{c.etiqueta}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                            CLASES_RIESGO[c.riesgo]
                          }`}
                        >
                          {ETIQUETA_RIESGO[c.riesgo]}
                        </span>
                      </div>
                      <p className="texto-suave mt-0.5 text-[11px]">{c.descripcion}</p>
                      {bloqueado && (
                        <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Bloqueado mientras el vehículo se mueve
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ---------- Confirmación ---------- */}
            {elegido !== null && (
              <div className="borde mb-3 rounded-lg border p-3">
                <p className="mb-1 text-sm font-medium">{elegido.etiqueta}</p>

                {elegido.advertencia !== undefined && (
                  <p
                    className={`mb-2 rounded px-2 py-1.5 text-[11px] ${
                      elegido.riesgo === 'peligroso'
                        ? 'bg-red-500/12 text-red-700 dark:text-red-400'
                        : 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {elegido.advertencia}
                  </p>
                )}

                {(elegido.type === 'custom' || elegido.type === 'positionPeriodic') && (
                  <div className="mb-2">
                    <label className="texto-suave mb-1 block text-[11px] font-medium" htmlFor="cmd-param">
                      {elegido.type === 'custom' ? 'Texto del comando' : 'Segundos entre reportes'}
                    </label>
                    <input
                      id="cmd-param"
                      value={parametro}
                      onChange={(e) => {
                        setParametro(e.target.value);
                      }}
                      placeholder={elegido.type === 'custom' ? 'RESET#' : '30'}
                      className="borde panel w-full rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>
                )}

                {elegido.riesgo === 'peligroso' && (
                  <div className="mb-2">
                    <label className="texto-suave mb-1 block text-[11px] font-medium" htmlFor="cmd-conf">
                      Escribe <strong>{PALABRA_CONFIRMACION}</strong> para continuar
                    </label>
                    <input
                      id="cmd-conf"
                      value={confirmacion}
                      onChange={(e) => {
                        setConfirmacion(e.target.value);
                      }}
                      placeholder={PALABRA_CONFIRMACION}
                      className="borde panel w-full rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-red-500/40"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={enviando || !confirmacionOk}
                  onClick={() => {
                    void enviar();
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-xs font-medium text-white transition disabled:opacity-40 ${
                    elegido.riesgo === 'peligroso'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {enviando ? 'Enviando…' : `Enviar «${elegido.etiqueta}»`}
                </button>
              </div>
            )}
          </>
        )}

        {error !== null && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {exito !== null && (
          <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            Comando enviado. {exito}
          </p>
        )}
      </div>
    </div>
  );
}
