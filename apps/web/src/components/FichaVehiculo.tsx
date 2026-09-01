/**
 * Formulario de la ficha administrativa de un vehículo.
 *
 * Lo que Traccar no guarda: placa, VIN, conductor, pólizas y vencimientos.
 */

import { useEffect, useState, type JSX } from 'react';

import { guardarFicha, type DatosFicha, type Ficha } from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';

interface Props {
  readonly unidad: Unit;
  readonly ficha: Ficha | null;
  readonly onCerrar: () => void;
  readonly onGuardada: (ficha: Ficha) => void;
}

const VACIA: DatosFicha = {
  plate: null,
  vin: null,
  brand: null,
  model: null,
  year: null,
  color: null,
  driverName: null,
  driverPhone: null,
  assignment: null,
  odometerOffsetKm: null,
  insurancePolicy: null,
  insuranceExpires: null,
  inspectionExpires: null,
  registrationExpires: null,
  notes: null,
};

const claseCampo =
  'borde panel w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50';
const claseEtiqueta = 'texto-suave mb-1 block text-xs font-medium';

export function FichaVehiculo({ unidad, ficha, onCerrar, onGuardada }: Props): JSX.Element {
  // El modal se monta de nuevo cada vez que se abre, asi que basta con
  // inicializar el estado desde la prop. Un efecto que copiara `ficha` a
  // `datos` provocaria un render en cascada al abrirlo.
  const [datos, setDatos] = useState<DatosFicha>(() => {
    if (ficha === null) return VACIA;
    const { deviceId: _ignorado, ...resto } = ficha;
    return resto;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('keydown', alTecla);
    };
  }, [onCerrar]);

  /** Los campos vacíos se guardan como null, no como cadena vacía. */
  const texto = (clave: keyof DatosFicha) => (valor: string) => {
    setDatos((d) => ({ ...d, [clave]: valor.trim() === '' ? null : valor }));
  };

  const numero = (clave: keyof DatosFicha) => (valor: string) => {
    const n = Number(valor);
    setDatos((d) => ({
      ...d,
      [clave]: valor.trim() === '' || !Number.isFinite(n) ? null : n,
    }));
  };

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    setError(null);
    try {
      onGuardada(await guardarFicha(unidad.id, datos));
      onCerrar();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="borde panel scroll-fino max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 sombra-alta">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{unidad.name}</h3>
            <p className="texto-suave font-mono text-xs">{unidad.uniqueId}</p>
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

        <div className="space-y-4">
          {/* --- Identificación --- */}
          <section>
            <h4 className="texto-suave mb-2 text-xs font-semibold tracking-wide uppercase">
              Identificación
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={claseEtiqueta} htmlFor="f-placa">Placa</label>
                <input id="f-placa" value={datos.plate ?? ''} placeholder="ABC-123-A"
                  onChange={(e) => { texto('plate')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-vin">VIN / Serie</label>
                <input id="f-vin" value={datos.vin ?? ''} placeholder="3N6AD33A1MK…"
                  onChange={(e) => { texto('vin')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-marca">Marca</label>
                <input id="f-marca" value={datos.brand ?? ''} placeholder="Nissan"
                  onChange={(e) => { texto('brand')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-modelo">Modelo</label>
                <input id="f-modelo" value={datos.model ?? ''} placeholder="NP300"
                  onChange={(e) => { texto('model')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-anio">Año</label>
                <input id="f-anio" type="number" inputMode="numeric" value={datos.year ?? ''} placeholder="2021"
                  onChange={(e) => { numero('year')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-color">Color</label>
                <input id="f-color" value={datos.color ?? ''} placeholder="Blanco"
                  onChange={(e) => { texto('color')(e.target.value); }} className={claseCampo} />
              </div>
            </div>
          </section>

          {/* --- Operación --- */}
          <section>
            <h4 className="texto-suave mb-2 text-xs font-semibold tracking-wide uppercase">
              Operación
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={claseEtiqueta} htmlFor="f-conductor">Conductor</label>
                <input id="f-conductor" value={datos.driverName ?? ''} placeholder="Juan Pérez"
                  onChange={(e) => { texto('driverName')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-tel">Teléfono</label>
                <input id="f-tel" value={datos.driverPhone ?? ''} placeholder="+52 55 …"
                  onChange={(e) => { texto('driverPhone')(e.target.value); }} className={claseCampo} />
              </div>
              <div className="col-span-2">
                <label className={claseEtiqueta} htmlFor="f-asig">Ruta o base</label>
                <input id="f-asig" value={datos.assignment ?? ''} placeholder="Ruta Norte"
                  onChange={(e) => { texto('assignment')(e.target.value); }} className={claseCampo} />
              </div>
            </div>
          </section>

          {/* --- Odómetro --- */}
          <section>
            <h4 className="texto-suave mb-2 text-xs font-semibold tracking-wide uppercase">
              Kilometraje
            </h4>
            <label className={claseEtiqueta} htmlFor="f-odo">
              Kilómetros del tablero al instalar el rastreador
            </label>
            <input id="f-odo" type="number" inputMode="numeric" value={datos.odometerOffsetKm ?? ''} placeholder="118400"
              onChange={(e) => { numero('odometerOffsetKm')(e.target.value); }} className={claseCampo} />
            <p className="texto-suave mt-1 text-xs">
              El rastreador cuenta desde que se instaló, no desde que el vehículo salió de la
              agencia. Este número se suma para obtener el kilometraje real.
            </p>
            {datos.odometerOffsetKm !== null && unidad.position?.totalDistanceKm != null && (
              <p className="mt-1.5 text-xs font-medium">
                Kilometraje real:{' '}
                {(datos.odometerOffsetKm + unidad.position.totalDistanceKm).toLocaleString(
                  'es-MX',
                  { maximumFractionDigits: 0 },
                )}{' '}
                km
              </p>
            )}
          </section>

          {/* --- Documentos --- */}
          <section>
            <h4 className="texto-suave mb-2 text-xs font-semibold tracking-wide uppercase">
              Documentos
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className={claseEtiqueta} htmlFor="f-poliza">Póliza de seguro</label>
                <input id="f-poliza" value={datos.insurancePolicy ?? ''} placeholder="GNP-99887"
                  onChange={(e) => { texto('insurancePolicy')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-seg">Seguro vence</label>
                <input id="f-seg" type="date" value={datos.insuranceExpires ?? ''}
                  onChange={(e) => { texto('insuranceExpires')(e.target.value); }} className={claseCampo} />
              </div>
              <div>
                <label className={claseEtiqueta} htmlFor="f-ver">Verificación vence</label>
                <input id="f-ver" type="date" value={datos.inspectionExpires ?? ''}
                  onChange={(e) => { texto('inspectionExpires')(e.target.value); }} className={claseCampo} />
              </div>
              <div className="col-span-2">
                <label className={claseEtiqueta} htmlFor="f-ten">Tenencia vence</label>
                <input id="f-ten" type="date" value={datos.registrationExpires ?? ''}
                  onChange={(e) => { texto('registrationExpires')(e.target.value); }} className={claseCampo} />
              </div>
            </div>
          </section>

          <div>
            <label className={claseEtiqueta} htmlFor="f-notas">Notas</label>
            <textarea id="f-notas" rows={2} value={datos.notes ?? ''} placeholder="Llantas cambiadas en agosto"
              onChange={(e) => { texto('notes')(e.target.value); }} className={claseCampo} />
          </div>

          {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() => { void guardar(); }}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar ficha'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="borde texto-suave rounded-lg border px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
