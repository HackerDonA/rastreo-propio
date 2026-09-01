/**
 * Mapa en vivo con toda la flota.
 *
 * CAMBIO DE ENFOQUE RESPECTO A LA PRIMERA VERSION
 * ------------------------------------------------
 * Al principio las unidades se dibujaban con una fuente GeoJSON agrupada y una
 * capa de simbolos: lo dibuja la GPU y aguanta miles de puntos. El problema es
 * que una capa de simbolos NO es HTML, y sobre ella no se puede poner un menu,
 * un campo de texto para renombrar ni un boton.
 *
 * Como el requisito es identificar cada unidad de un vistazo y poder editarla
 * ahi mismo, ahora cada unidad es un marcador DOM de MapLibre con contenido
 * React (via createPortal). El costo es real y conviene tenerlo claro:
 *
 *   · Los marcadores DOM los reposiciona el navegador en cada cuadro. Con
 *     decenas de unidades va bien; con cientos, el mapa se arrastra.
 *   · Se pierde el agrupamiento automatico, que solo funciona con fuentes
 *     GeoJSON.
 *
 * Mitigaciones aplicadas:
 *   · Los marcadores se CREAN UNA VEZ por unidad y despues solo se les mueve
 *     la coordenada. Recrearlos en cada actualizacion seria mucho peor.
 *   · Modo compacto (solo icono) para cuando las burbujas se encimen, y un
 *     interruptor para apagar los nombres.
 *
 * Si algun dia la flota crece a cientos de unidades, el camino es volver a la
 * capa GeoJSON para el dibujado masivo y dejar el marcador DOM solo para la
 * unidad seleccionada.
 */

import type { Feature } from 'geojson';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapaLibre,
  type Marker,
} from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

import type { Geocerca } from '../lib/flota-api.ts';
import type { Unit } from '../lib/tipos.ts';
import type { Categoria } from '../lib/vehiculos.ts';
import { BurbujaUnidad } from './BurbujaUnidad.tsx';

const ESTILO_CLARO: string =
  import.meta.env['VITE_MAP_STYLE_LIGHT'] ?? 'https://tiles.openfreemap.org/styles/liberty';
const ESTILO_OSCURO: string =
  import.meta.env['VITE_MAP_STYLE_DARK'] ?? 'https://tiles.openfreemap.org/styles/dark';
const CENTRO: [number, number] = [
  Number(import.meta.env['VITE_MAP_CENTER_LNG'] ?? -99.1332),
  Number(import.meta.env['VITE_MAP_CENTER_LAT'] ?? 19.4326),
];
const ZOOM = Number(import.meta.env['VITE_MAP_ZOOM'] ?? 11);

/**
 * Cierra un anillo si no lo esta.
 *
 * GeoJSON exige que el primer y el ultimo punto de un poligono coincidan. El
 * anillo que devuelve el BFF no siempre viene cerrado, y MapLibre dibuja mal
 * (o no dibuja) un poligono abierto, sin dar ningun error.
 */
function cerrarAnillo(
  anillo: readonly (readonly [number, number])[],
): [number, number][] {
  const puntos = anillo.map((p) => [p[0], p[1]] as [number, number]);
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (
    primero !== undefined &&
    ultimo !== undefined &&
    (primero[0] !== ultimo[0] || primero[1] !== ultimo[1])
  ) {
    puntos.push([primero[0], primero[1]]);
  }
  return puntos;
}

/** Debajo de este zoom las burbujas se encimarian; se muestran compactas. */
const ZOOM_COMPACTO = 11.5;

interface Props {
  readonly unidades: readonly Unit[];
  readonly seleccionada: number | null;
  readonly onSeleccionar: (id: number | null) => void;
  readonly onRenombrar: (id: number, nombre: string) => Promise<void>;
  readonly onCambiarIcono: (id: number, categoria: Categoria) => Promise<void>;
  readonly oscuro: boolean;
  readonly mostrarNombres: boolean;
  readonly geocercas: readonly Geocerca[];
  /**
   * Cuando no es null, el mapa esta en modo dibujo: cada clic agrega un punto
   * en vez de seleccionar una unidad.
   */
  readonly dibujando: 'circulo' | 'poligono' | null;
  readonly onPuntoDibujado: (punto: readonly [number, number]) => void;
  /** Vertices ya colocados, para dibujar la vista previa. */
  readonly puntosDibujo: readonly (readonly [number, number])[];
  /** Anillo de vista previa del circulo que se esta creando. */
  readonly anilloPrevio: readonly (readonly [number, number])[] | null;
  /** Anillo al que encuadrar la vista. Cambiar la referencia dispara el ajuste. */
  readonly encuadrar: readonly (readonly [number, number])[] | null;
}

export function MapaEnVivo({
  unidades,
  seleccionada,
  onSeleccionar,
  onRenombrar,
  onCambiarIcono,
  oscuro,
  mostrarNombres,
  geocercas,
  dibujando,
  onPuntoDibujado,
  puntosDibujo,
  anilloPrevio,
  encuadrar,
}: Props): JSX.Element {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  /** Marcador y su nodo raiz, uno por unidad. Se crean una sola vez. */
  const marcadoresRef = useRef(new Map<number, { marker: Marker; el: HTMLDivElement }>());

  // El manejador de clic del mapa se instala UNA vez y necesita leer el estado
  // actual del dibujo. Se guarda en refs, sincronizadas en un efecto: escribir
  // un ref durante el render rompe las garantias de React con el renderizado
  // concurrente (regla react-hooks/refs).
  const dibujandoRef = useRef(dibujando);
  const onPuntoRef = useRef(onPuntoDibujado);
  useEffect(() => {
    dibujandoRef.current = dibujando;
    onPuntoRef.current = onPuntoDibujado;
  }, [dibujando, onPuntoDibujado]);

  const [nodos, setNodos] = useState<readonly { id: number; el: HTMLDivElement }[]>([]);
  const [zoomActual, setZoomActual] = useState(ZOOM);
  const [mapaListo, setMapaListo] = useState(false);

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
    mapa.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    mapa.on('zoom', () => {
      setZoomActual(mapa.getZoom());
    });
    /**
     * Capas de geocercas.
     *
     * Se reinstalan en `styledata` porque cambiar de tema reemplaza el estilo
     * entero y se lleva por delante fuentes y capas. Los marcadores DOM no
     * sufren esto, pero las capas si.
     */
    const instalarGeocercas = (): void => {
      if (mapa.getSource('geocercas') === undefined) {
        mapa.addSource('geocercas', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (mapa.getSource('dibujo') === undefined) {
        mapa.addSource('dibujo', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Relleno translucido: la geocerca tiene que dejar ver el mapa debajo,
      // o tapa justo las calles que uno quiere comprobar.
      if (mapa.getLayer('geocercas-relleno') === undefined) {
        mapa.addLayer({
          id: 'geocercas-relleno',
          type: 'fill',
          source: 'geocercas',
          paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.12 },
        });
      }
      if (mapa.getLayer('geocercas-borde') === undefined) {
        mapa.addLayer({
          id: 'geocercas-borde',
          type: 'line',
          source: 'geocercas',
          paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-opacity': 0.8 },
        });
      }
      if (mapa.getLayer('geocercas-etiqueta') === undefined) {
        mapa.addLayer({
          id: 'geocercas-etiqueta',
          type: 'symbol',
          source: 'geocercas',
          layout: {
            'text-field': ['get', 'nombre'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 11,
          },
          paint: {
            'text-color': '#7c3aed',
            'text-halo-color': oscuro ? '#0f172a' : '#ffffff',
            'text-halo-width': 1.8,
          },
        });
      }

      // Vista previa de lo que se esta dibujando, en otro color para que se
      // distinga de las geocercas ya guardadas.
      if (mapa.getLayer('dibujo-relleno') === undefined) {
        mapa.addLayer({
          id: 'dibujo-relleno',
          type: 'fill',
          source: 'dibujo',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.2 },
        });
      }
      if (mapa.getLayer('dibujo-borde') === undefined) {
        mapa.addLayer({
          id: 'dibujo-borde',
          type: 'line',
          source: 'dibujo',
          paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1] },
        });
      }
      if (mapa.getLayer('dibujo-vertices') === undefined) {
        mapa.addLayer({
          id: 'dibujo-vertices',
          type: 'circle',
          source: 'dibujo',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 5,
            'circle-color': '#f59e0b',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }
    };

    mapa.on('load', () => {
      instalarGeocercas();
      setMapaListo(true);
    });
    mapa.on('styledata', instalarGeocercas);

    // En modo dibujo, el clic coloca un vertice en vez de interactuar con el
    // mapa. Se lee del ref para que este efecto siga corriendo una sola vez.
    mapa.on('click', (evento) => {
      if (dibujandoRef.current === null) return;
      onPuntoRef.current([evento.lngLat.lng, evento.lngLat.lat]);
    });

    // El ref se copia a una variable local: para cuando corra la limpieza,
    // marcadoresRef.current podria apuntar a otro objeto y se fugarian los
    // marcadores de este mapa sin quitarlos nunca.
    const marcadoresDeEsteMapa = marcadoresRef.current;

    return () => {
      for (const { marker } of marcadoresDeEsteMapa.values()) marker.remove();
      marcadoresDeEsteMapa.clear();
      setNodos([]);
      mapa.remove();
      mapaRef.current = null;
      setMapaListo(false);
    };
    // El tema inicial se aplica aqui; los cambios posteriores los maneja su
    // propio efecto con setStyle, sin recrear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Cambio de tema -------------------------------------------------------
  useEffect(() => {
    // Los marcadores son DOM, no capas del estilo: setStyle no se los lleva por
    // delante, asi que no hay que reinstalarlos como si fueran capas.
    mapaRef.current?.setStyle(oscuro ? ESTILO_OSCURO : ESTILO_CLARO);
  }, [oscuro]);

  // --- Altas, bajas y movimiento de marcadores ------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null || !mapaListo) return;

    const marcadores = marcadoresRef.current;
    const vistos = new Set<number>();
    let cambioElConjunto = false;

    for (const unidad of unidades) {
      const posicion = unidad.position;
      if (posicion === null) continue;
      vistos.add(unidad.id);

      let entrada = marcadores.get(unidad.id);
      if (entrada === undefined) {
        const el = document.createElement('div');
        // Sin esto, el contenedor del marcador captura los clics de arrastre
        // del mapa en toda su caja, no solo sobre la burbuja.
        el.style.pointerEvents = 'auto';
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
          // Sube el elemento para que la flecha de rumbo, que va abajo del
          // todo, quede centrada exactamente sobre la coordenada.
          offset: [0, 12],
        })
          .setLngLat([posicion.longitude, posicion.latitude])
          .addTo(mapa);

        entrada = { marker, el };
        marcadores.set(unidad.id, entrada);
        cambioElConjunto = true;
      } else {
        entrada.marker.setLngLat([posicion.longitude, posicion.latitude]);
      }
    }

    for (const [id, { marker }] of marcadores) {
      if (!vistos.has(id)) {
        marker.remove();
        marcadores.delete(id);
        cambioElConjunto = true;
      }
    }

    // Solo se re-renderiza la lista de portales cuando cambia el CONJUNTO de
    // marcadores, no en cada actualizacion de posicion.
    if (cambioElConjunto) {
      setNodos([...marcadores].map(([id, { el }]) => ({ id, el })));
    }
  }, [unidades, mapaListo]);

  // --- Geocercas guardadas --------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null || !mapaListo) return;
    const fuente = mapa.getSource<GeoJSONSource>('geocercas');
    fuente?.setData({
      type: 'FeatureCollection',
      features: geocercas.map((g) => ({
        type: 'Feature' as const,
        id: g.id,
        geometry: {
          type: 'Polygon' as const,
          // GeoJSON exige el anillo cerrado: el ultimo punto igual al primero.
          coordinates: [cerrarAnillo(g.anillo)],
        },
        properties: { id: g.id, nombre: g.name },
      })),
    });
  }, [geocercas, mapaListo]);

  // --- Vista previa de lo que se esta dibujando ----------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null || !mapaListo) return;
    const fuente = mapa.getSource<GeoJSONSource>('dibujo');
    if (fuente === undefined) return;

    const features: Feature[] = [];

    // Los vertices siempre se ven, para poder corregir antes de cerrar.
    for (const [i, punto] of puntosDibujo.entries()) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [punto[0], punto[1]] },
        properties: { indice: i },
      });
    }

    if (anilloPrevio !== null && anilloPrevio.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [cerrarAnillo(anilloPrevio)] },
        properties: {},
      });
    } else if (puntosDibujo.length >= 2) {
      // Con menos de 3 puntos todavia no hay poligono: se dibuja la linea que
      // lleva, que es lo que permite ver la forma mientras se hace.
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: puntosDibujo.map((p) => [p[0], p[1]]),
        },
        properties: {},
      });
    }

    fuente.setData({ type: 'FeatureCollection', features });
  }, [puntosDibujo, anilloPrevio, mapaListo]);

  // --- El cursor avisa de que se esta en modo dibujo -----------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null) return;
    mapa.getCanvas().style.cursor = dibujando === null ? '' : 'crosshair';
  }, [dibujando]);

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
    // Solo reacciona al cambio de seleccion: si dependiera de `unidades`, el
    // mapa perseguiria a la unidad y no dejaria mover la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionada]);

  // --- Encuadrar en una zona ------------------------------------------------
  useEffect(() => {
    const mapa = mapaRef.current;
    if (mapa === null || encuadrar === null || encuadrar.length === 0) return;

    // Caja envolvente del anillo. fitBounds necesita las esquinas suroeste y
    // noreste, no la lista de puntos.
    let oeste = Infinity;
    let sur = Infinity;
    let este = -Infinity;
    let norte = -Infinity;
    for (const [lon, lat] of encuadrar) {
      if (lon < oeste) oeste = lon;
      if (lon > este) este = lon;
      if (lat < sur) sur = lat;
      if (lat > norte) norte = lat;
    }
    mapa.fitBounds(
      [
        [oeste, sur],
        [este, norte],
      ],
      { padding: 80, duration: 700, maxZoom: 16 },
    );
  }, [encuadrar]);

  const centrarEn = useCallback(
    (id: number) => {
      const mapa = mapaRef.current;
      const unidad = unidades.find((u) => u.id === id);
      if (mapa === null || unidad?.position == null) return;
      mapa.easeTo({
        center: [unidad.position.longitude, unidad.position.latitude],
        zoom: Math.max(mapa.getZoom(), 15),
        duration: 700,
      });
    },
    [unidades],
  );

  /** Sube el marcador con un panel abierto por encima de sus vecinos. */
  const alAbrirPanel = useCallback((id: number, abierto: boolean) => {
    const entrada = marcadoresRef.current.get(id);
    if (entrada === undefined) return;
    entrada.el.style.zIndex = abierto ? '30' : '';
  }, []);

  const compacta = !mostrarNombres || zoomActual < ZOOM_COMPACTO;

  return (
    <>
      <div ref={contenedorRef} className="h-full w-full" />
      {nodos.map(({ id, el }) => {
        const unidad = unidades.find((u) => u.id === id);
        if (unidad === undefined) return null;
        return createPortal(
          <BurbujaUnidad
            unidad={unidad}
            seleccionada={id === seleccionada}
            compacta={compacta}
            onSeleccionar={onSeleccionar}
            onRenombrar={onRenombrar}
            onCambiarIcono={onCambiarIcono}
            onCentrar={centrarEn}
            onPanelAbierto={alAbrirPanel}
          />,
          el,
          String(id),
        );
      })}
    </>
  );
}
