/**
 * Página pública de un enlace compartido.
 *
 * La ve alguien que no tiene cuenta: un cliente esperando su entrega, un
 * familiar, una aseguradora. Por eso es una pantalla completa y sencilla, sin
 * nada de la aplicación alrededor — ni panel lateral, ni pestañas, ni acceso a
 * ninguna otra unidad.
 */

import maplibregl, { type Map as MapaLibre, type Marker } from 'maplibre-gl';
import { useEffect, useRef, useState, type JSX } from 'react';

import { IconoVehiculo } from './IconoVehiculo.tsx';

const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000';
const ESTILO: string =
  import.meta.env['VITE_MAP_STYLE_LIGHT'] ?? 'https://tiles.openfreemap.org/styles/liberty';

/** Cada cuánto se refresca. No hay WebSocket aquí: es una vista pasiva. */
const REFRESCO_MS = 20_000;

interface Compartido {
  readonly nombre: string;
  readonly categoria: string | null;
  readonly expiraEl: string;
  readonly posicion: {
    readonly latitud: number;
    readonly longitud: number;
    readonly velocidadKmh: number;
    readonly rumbo: number;
    readonly actualizado: string;
  } | null;
}

function tiempoRelativo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${String(Math.floor(s / 60))} min`;
  if (s < 86400) return `hace ${String(Math.floor(s / 3600))} h`;
  return `hace ${String(Math.floor(s / 86400))} d`;
}

export function VistaCompartida({ token }: { readonly token: string }): JSX.Element {
  const [datos, setDatos] = useState<Compartido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const marcadorRef = useRef<Marker | null>(null);

  // --- Consulta periódica ---------------------------------------------------
  useEffect(() => {
    let vivo = true;

    const consultar = async (): Promise<void> => {
      try {
        const r = await fetch(`${API_URL}/api/share/${token}`);
        if (!vivo) return;
        if (!r.ok) {
          setError('Este enlace no es válido o ya caducó.');
          setDatos(null);
          return;
        }
        setDatos((await r.json()) as Compartido);
        setError(null);
      } catch {
        if (vivo) setError('No se pudo conectar. Revisa tu conexión a internet.');
      } finally {
        if (vivo) setCargando(false);
      }
    };

    void consultar();
    const t = setInterval(() => {
      void consultar();
    }, REFRESCO_MS);

    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [token]);

  // --- Mapa -----------------------------------------------------------------
  useEffect(() => {
    const contenedor = contenedorRef.current;
    const posicion = datos?.posicion;
    if (contenedor === null || posicion == null) return;

    if (mapaRef.current === null) {
      mapaRef.current = new maplibregl.Map({
        container: contenedor,
        style: ESTILO,
        center: [posicion.longitud, posicion.latitud],
        zoom: 14,
        attributionControl: { compact: true },
      });
      mapaRef.current.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'top-right',
      );
    }

    const mapa = mapaRef.current;
    if (marcadorRef.current === null) {
      const el = document.createElement('div');
      el.className =
        'flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-indigo-600 sombra-alta';
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="white" width="18" height="18"><path d="M12 3.5 18.5 20 12 16.2 5.5 20Z"/></svg>';
      marcadorRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([posicion.longitud, posicion.latitud])
        .addTo(mapa);
    } else {
      marcadorRef.current.setLngLat([posicion.longitud, posicion.latitud]);
      mapa.easeTo({ center: [posicion.longitud, posicion.latitud], duration: 1000 });
    }

    const flecha = marcadorRef.current.getElement().querySelector('svg');
    if (flecha !== null) flecha.style.transform = `rotate(${String(posicion.rumbo)}deg)`;
  }, [datos]);

  useEffect(
    () => () => {
      mapaRef.current?.remove();
      mapaRef.current = null;
    },
    [],
  );

  // --- Estados sin mapa -----------------------------------------------------
  if (cargando) {
    return (
      <div className="superficie flex h-dvh items-center justify-center">
        <p className="texto-suave text-sm">Cargando…</p>
      </div>
    );
  }

  if (error !== null || datos === null) {
    return (
      <div className="superficie flex h-dvh items-center justify-center p-6">
        <div className="tarjeta max-w-sm p-6 text-center">
          <div className="texto-suave mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/5 dark:bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h1 className="mb-1 text-base font-semibold">Enlace no disponible</h1>
          <p className="texto-suave text-sm">
            {error ?? 'Este enlace no es válido o ya caducó.'}
          </p>
          <p className="texto-suave mt-3 text-xs">
            Los enlaces de ubicación caducan por seguridad. Pide uno nuevo a quien te lo
            compartió.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="superficie flex h-dvh flex-col">
      <header className="borde panel flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
          <IconoVehiculo categoria={datos.categoria} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{datos.nombre}</h1>
          <p className="texto-suave text-xs">
            {datos.posicion === null
              ? 'Sin posición todavía'
              : `${String(datos.posicion.velocidadKmh)} km/h · ${tiempoRelativo(datos.posicion.actualizado)}`}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {datos.posicion === null ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="texto-suave text-sm">
              Esta unidad todavía no ha reportado su ubicación.
            </p>
          </div>
        ) : (
          <div ref={contenedorRef} className="h-full w-full" />
        )}
      </div>

      <footer className="borde panel texto-suave shrink-0 border-t px-4 py-2 text-xs">
        Se actualiza cada 20 segundos · El enlace caduca el{' '}
        {new Date(datos.expiraEl).toLocaleString('es-MX', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </footer>
    </div>
  );
}
