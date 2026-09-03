/**
 * Barra superior: identidad, indicadores de flota y estado del enlace en vivo.
 */

import { useMemo } from 'react';
import type { JSX } from 'react';

import type { Unit } from '../lib/tipos.ts';

interface Props {
  readonly unidades: readonly Unit[];
  readonly enVivo: boolean;
  readonly oscuro: boolean;
  readonly onCambiarTema: () => void;
  /** Centro de avisos. Se recibe como elemento para que la barra no dependa
   *  del estado de los eventos: solo le reserva su lugar. */
  readonly avisos?: JSX.Element | undefined;
}

interface IndicadorProps {
  readonly etiqueta: string;
  readonly valor: string;
  readonly color?: string;
  /**
   * Se oculta en pantallas chicas.
   *
   * En un telefono la barra ocupa lo que le des, y seis indicadores la
   * convierten en tres renglones que se comen el mapa. Los que informan de un
   * vistazo -cuantas hay, cuantas se mueven, cuantas estan mudas- se quedan
   * siempre; los agregados de consulta se reservan para pantalla ancha.
   */
  readonly soloAncho?: boolean;
}

function Indicador({ etiqueta, valor, color, soloAncho }: IndicadorProps): JSX.Element {
  return (
    <div className={`flex flex-col ${soloAncho === true ? 'hidden lg:flex' : ''}`}>
      <span className="texto-suave text-xs tracking-wide uppercase">{etiqueta}</span>
      <span
        className="text-lg leading-tight font-semibold tabular-nums"
        style={color === undefined ? undefined : { color }}
      >
        {valor}
      </span>
    </div>
  );
}

export function BarraFlota({
  unidades,
  enVivo,
  oscuro,
  onCambiarTema,
  avisos,
}: Props): JSX.Element {
  const stats = useMemo(() => {
    const enMovimiento = unidades.filter((u) => u.state === 'moving').length;
    const detenidas = unidades.filter((u) => u.state === 'stopped').length;
    const sinSenal = unidades.filter(
      (u) => u.state === 'offline' || u.state === 'unknown',
    ).length;

    // Odometro total de la flota, en kilometros. Traccar lo acumula por unidad.
    const kmTotales = unidades.reduce((acc, u) => acc + (u.position?.totalDistanceKm ?? 0), 0);

    const conVelocidad = unidades.filter((u) => (u.position?.speedKmh ?? 0) > 1);
    const velocidadMedia =
      conVelocidad.length === 0
        ? 0
        : conVelocidad.reduce((acc, u) => acc + (u.position?.speedKmh ?? 0), 0) /
          conVelocidad.length;

    return { enMovimiento, detenidas, sinSenal, kmTotales, velocidadMedia };
  }, [unidades]);

  return (
    <header className="borde panel segura-arriba segura-lados flex shrink-0 items-center gap-x-3 border-b px-3 pb-2.5 md:flex-wrap md:gap-x-6 md:px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5" aria-hidden="true">
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm leading-tight font-semibold">Rastreo</h1>
          <p className="texto-suave hidden text-xs leading-tight md:block">
            Monitoreo de flota
          </p>
        </div>
      </div>

      <div className="borde hidden h-9 w-px bg-current opacity-10 md:block" />

      {/*
        Indicadores. Ocultos en telefono.

        Con seis cifras y `flex-wrap`, en una pantalla de 390 px la cabecera
        pasaba de un renglon a tres y se comia un tercio del mapa, que es
        justo lo unico que se quiere ver en un telefono. En escritorio caben
        de sobra en una sola linea y son lo mejor de la barra.

        El resumen de la flota no se pierde: aparece dentro de la hoja de
        unidades, que es adonde se va cuando se quiere ese dato.
      */}
      <div className="hidden flex-1 flex-wrap items-center gap-x-6 gap-y-2 md:flex">
        <Indicador etiqueta="Unidades" valor={String(unidades.length)} />
        <Indicador
          etiqueta="En movimiento"
          valor={String(stats.enMovimiento)}
          color="#16a34a"
        />
        <Indicador etiqueta="Detenidas" valor={String(stats.detenidas)} color="#d97706" />
        <Indicador etiqueta="Sin señal" valor={String(stats.sinSenal)} color="#64748b" />
        <Indicador
          etiqueta="Vel. promedio"
          valor={`${Math.round(stats.velocidadMedia)} km/h`}
          soloAncho
        />
        <Indicador
          etiqueta="Odómetro flota"
          valor={`${stats.kmTotales.toLocaleString('es-MX', { maximumFractionDigits: 0 })} km`}
          soloAncho
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:ml-0 md:gap-3">
        <div
          className="borde flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
          /*
           * Lo que mide este indicador es el WebSocket ENTRE EL NAVEGADOR Y LA
           * API, no el enlace de la API con Traccar. Decir "sin conexión con
           * Traccar" mandaba a revisar los contenedores, que es el sitio
           * equivocado: pueden estar perfectamente sanos y aun así verse esto.
           * El estado real de Traccar se consulta en /health.
           */
          title={
            enVivo
              ? 'Recibiendo posiciones en vivo'
              : 'Sin el flujo en vivo: los datos se ven, pero no se actualizan solos. Recarga la página; si sigue, revisa que la API esté arriba.'
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${enVivo ? 'pulso bg-green-500' : 'bg-red-500'}`}
          />
          <span className="texto-suave hidden font-medium sm:inline">
            {enVivo ? 'En vivo' : 'Sin conexión'}
          </span>
        </div>

        {avisos}

        <button
          type="button"
          onClick={onCambiarTema}
          className="borde texto-suave toque flex items-center justify-center rounded-lg border transition hover:bg-black/5 dark:hover:bg-white/5"
          aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={oscuro ? 'Modo claro' : 'Modo oscuro'}
        >
          {oscuro ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
