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

import maplibregl, { type Map as MapaLibre, type Marker } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

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
}

export function MapaEnVivo({
  unidades,
  seleccionada,
  onSeleccionar,
  onRenombrar,
  onCambiarIcono,
  oscuro,
  mostrarNombres,
}: Props): JSX.Element {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  /** Marcador y su nodo raiz, uno por unidad. Se crean una sola vez. */
  const marcadoresRef = useRef(new Map<number, { marker: Marker; el: HTMLDivElement }>());

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
    mapa.on('load', () => {
      setMapaListo(true);
    });

    return () => {
      for (const { marker } of marcadoresRef.current.values()) marker.remove();
      marcadoresRef.current.clear();
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
