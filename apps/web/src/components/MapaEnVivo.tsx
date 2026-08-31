/**
 * Mapa en vivo con toda la flota.
 *
 * Decisiones que importan:
 *
 *  · Las unidades van en una fuente GeoJSON con `cluster: true`, no como
 *    marcadores DOM. Con diez marcadores DOM no se nota, pero cada uno es un
 *    nodo que el navegador reposiciona en cada cuadro; con cincuenta el mapa se
 *    arrastra. Una fuente GeoJSON la dibuja la GPU.
 *
 *  · Los iconos se generan en un canvas al vuelo, uno por color de estado. Asi
 *    no hay archivos de imagen que cargar ni peticiones extra, y el color de
 *    estado vive en un solo lugar (lib/tipos.ts).
 *
 *  · Al cambiar de tema, MapLibre reemplaza el estilo entero y con el se van
 *    las capas y las imagenes. Por eso todo el montaje se reinstala en el
 *    evento `styledata`.
 */

import type { FeatureCollection, Point } from 'geojson';
import maplibregl, { type GeoJSONSource, type Map as MapaLibre } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { JSX } from 'react';

import { COLOR_ESTADO, type Unit, type UnitState } from '../lib/tipos.ts';

const ESTILO_CLARO: string =
  import.meta.env['VITE_MAP_STYLE_LIGHT'] ?? 'https://tiles.openfreemap.org/styles/liberty';
const ESTILO_OSCURO: string =
  import.meta.env['VITE_MAP_STYLE_DARK'] ?? 'https://tiles.openfreemap.org/styles/dark';
const CENTRO: [number, number] = [
  Number(import.meta.env['VITE_MAP_CENTER_LNG'] ?? -99.1332),
  Number(import.meta.env['VITE_MAP_CENTER_LAT'] ?? 19.4326),
];
const ZOOM = Number(import.meta.env['VITE_MAP_ZOOM'] ?? 11);

const ESTADOS: readonly UnitState[] = ['moving', 'stopped', 'offline', 'unknown'];
const nombreIcono = (estado: UnitState): string => `flecha-${estado}`;

/**
 * Dibuja la flecha de un vehiculo en un canvas y la devuelve como imagen.
 *
 * Apunta hacia arriba (0 grados = norte); MapLibre la rota segun el rumbo.
 */
function crearIconoFlecha(color: string): ImageData {
  const tamano = 48;
  const canvas = document.createElement('canvas');
  canvas.width = tamano;
  canvas.height = tamano;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('No se pudo crear el contexto 2D del canvas');

  const c = tamano / 2;

  // Halo suave, para que la flecha se lea sobre cualquier fondo del mapa.
  ctx.beginPath();
  ctx.arc(c, c, 15, 0, Math.PI * 2);
  ctx.fillStyle = `${color}26`;
  ctx.fill();

  // Circulo de fondo con borde blanco.
  ctx.beginPath();
  ctx.arc(c, c, 11, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Punta de flecha blanca indicando el rumbo.
  ctx.beginPath();
  ctx.moveTo(c, c - 6.5);
  ctx.lineTo(c + 4.5, c + 5);
  ctx.lineTo(c, c + 2.5);
  ctx.lineTo(c - 4.5, c + 5);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return ctx.getImageData(0, 0, tamano, tamano);
}

function aGeoJson(unidades: readonly Unit[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: unidades.flatMap((u) => {
      // flatMap con arreglo vacio en vez de filter + `!`: asi TypeScript sabe
      // que `posicion` no es null sin necesidad de una asercion.
      const posicion = u.position;
      if (posicion === null) return [];
      return [
        {
          type: 'Feature' as const,
          id: u.id,
          geometry: {
            type: 'Point' as const,
            coordinates: [posicion.longitude, posicion.latitude],
          },
          properties: {
            id: u.id,
            nombre: u.name,
            estado: u.state,
            rumbo: posicion.course,
            velocidad: Math.round(posicion.speedKmh),
          },
        },
      ];
    }),
  };
}

interface Props {
  readonly unidades: readonly Unit[];
  readonly seleccionada: number | null;
  readonly onSeleccionar: (id: number | null) => void;
  readonly oscuro: boolean;
}

export function MapaEnVivo({ unidades, seleccionada, onSeleccionar, oscuro }: Props): JSX.Element {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const unidadesRef = useRef<readonly Unit[]>(unidades);
  const onSeleccionarRef = useRef(onSeleccionar);

  // Se guardan en refs para que el efecto de montaje no dependa de ellos y el
  // mapa no se reconstruya en cada render.
  unidadesRef.current = unidades;
  onSeleccionarRef.current = onSeleccionar;

  // --- Montaje del mapa (una sola vez) --------------------------------------
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (contenedor === null) return;

    const mapa = new maplibregl.Map({
      container: contenedor,
      style: oscuro ? ESTILO_OSCURO : ESTILO_CLARO,
      center: CENTRO,
      zoom: ZOOM,
      attributionControl: { compact: true },
    });
    mapaRef.current = mapa;

    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapa.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left',
    );

    /** Instala imagenes, fuente y capas. Se repite cada vez que cambia el estilo. */
    const instalarCapas = (): void => {
      for (const estado of ESTADOS) {
        const nombre = nombreIcono(estado);
        if (!mapa.hasImage(nombre)) {
          mapa.addImage(nombre, crearIconoFlecha(COLOR_ESTADO[estado]), { pixelRatio: 2 });
        }
      }

      if (mapa.getSource('unidades') === undefined) {
        mapa.addSource('unidades', {
          type: 'geojson',
          data: aGeoJson(unidadesRef.current),
          cluster: true,
          clusterRadius: 45,
          // A partir de este zoom se dejan de agrupar: si el usuario se acerco
          // tanto, quiere ver las unidades por separado.
          clusterMaxZoom: 15,
        });
      }

      if (mapa.getLayer('cumulos') === undefined) {
        mapa.addLayer({
          id: 'cumulos',
          type: 'circle',
          source: 'unidades',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#2563eb',
            'circle-opacity': 0.9,
            'circle-radius': ['step', ['get', 'point_count'], 16, 5, 21, 15, 27],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.85,
          },
        });
      }

      if (mapa.getLayer('cumulos-conteo') === undefined) {
        mapa.addLayer({
          id: 'cumulos-conteo',
          type: 'symbol',
          source: 'unidades',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 13,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });
      }

      if (mapa.getLayer('unidades-punto') === undefined) {
        mapa.addLayer({
          id: 'unidades-punto',
          type: 'symbol',
          source: 'unidades',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': [
              'match',
              ['get', 'estado'],
              'moving',
              nombreIcono('moving'),
              'stopped',
              nombreIcono('stopped'),
              'offline',
              nombreIcono('offline'),
              nombreIcono('unknown'),
            ],
            'icon-rotate': ['get', 'rumbo'],
            // La flecha rota con el mapa, no con la pantalla: si el usuario
            // gira el mapa, el rumbo tiene que seguir apuntando al norte real.
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-size': 0.55,
          },
        });
      }

      if (mapa.getLayer('unidades-etiqueta') === undefined) {
        mapa.addLayer({
          id: 'unidades-etiqueta',
          type: 'symbol',
          source: 'unidades',
          filter: ['!', ['has', 'point_count']],
          // Las etiquetas solo aparecen con zoom suficiente: a nivel ciudad se
          // encimarian unas con otras y no se leeria ninguna.
          minzoom: 12,
          layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-optional': true,
          },
          paint: {
            'text-color': oscuro ? '#e2e8f0' : '#1e293b',
            'text-halo-color': oscuro ? '#0f172a' : '#ffffff',
            'text-halo-width': 1.6,
          },
        });
      }
    };

    mapa.on('load', instalarCapas);
    // `styledata` se dispara tambien al cambiar de tema, cuando MapLibre
    // reemplaza el estilo y se lleva por delante capas, fuentes e imagenes.
    mapa.on('styledata', instalarCapas);

    // --- Interaccion --------------------------------------------------------
    mapa.on('click', 'unidades-punto', (evento) => {
      const propiedades = evento.features?.[0]?.properties;
      const id = propiedades?.['id'];
      if (typeof id === 'number') onSeleccionarRef.current(id);
    });

    mapa.on('click', 'cumulos', (evento) => {
      const rasgo = evento.features?.[0];
      if (rasgo === undefined || rasgo.geometry.type !== 'Point') return;
      const idCumulo = rasgo.properties?.['cluster_id'];
      if (typeof idCumulo !== 'number') return;

      // Se captura el centro ANTES del await: dentro del then, TypeScript ya no
      // conserva el estrechamiento sobre `rasgo`.
      const centro = rasgo.geometry.coordinates as [number, number];
      const fuente = mapa.getSource('unidades') as GeoJSONSource | undefined;
      void fuente?.getClusterExpansionZoom(idCumulo).then((zoom) => {
        mapa.easeTo({ center: centro, zoom });
      });
    });

    for (const capa of ['unidades-punto', 'cumulos'] as const) {
      mapa.on('mouseenter', capa, () => {
        mapa.getCanvas().style.cursor = 'pointer';
      });
      mapa.on('mouseleave', capa, () => {
        mapa.getCanvas().style.cursor = '';
      });
    }

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
    // El estilo inicial depende de `oscuro`, pero los cambios posteriores de
    // tema los maneja su propio efecto con setStyle, sin recrear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Cambio de tema -------------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null) return;
    mapa.setStyle(oscuro ? ESTILO_OSCURO : ESTILO_CLARO);
  }, [oscuro]);

  // --- Actualizacion de posiciones -----------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null) return;
    const fuente = mapa.getSource('unidades') as GeoJSONSource | undefined;
    fuente?.setData(aGeoJson(unidades));
  }, [unidades]);

  // --- Centrar en la unidad seleccionada -----------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null || seleccionada === null) return;
    const unidad = unidades.find((u) => u.id === seleccionada);
    if (unidad?.position == null) return;
    mapa.easeTo({
      center: [unidad.position.longitude, unidad.position.latitude],
      zoom: Math.max(mapa.getZoom(), 14),
      duration: 800,
    });
    // Solo debe reaccionar al cambio de seleccion, no a cada actualizacion de
    // posicion: si no, el mapa perseguiria a la unidad y no dejaria mover la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionada]);

  return <div ref={contenedorRef} className="h-full w-full" />;
}
