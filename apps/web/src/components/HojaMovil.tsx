/**
 * Hoja deslizante inferior (bottom sheet).
 *
 * POR QUE ESTE PATRON Y NO UN CAJON LATERAL
 * -----------------------------------------
 * En escritorio, un panel a la izquierda es lo natural: hay ancho de sobra y
 * el raton llega igual de rapido a cualquier parte de la pantalla.
 *
 * En un telefono no. El ancho es el recurso escaso -no la altura- asi que un
 * cajon lateral tapa el mapa por completo; y el pulgar alcanza comodamente el
 * tercio inferior de la pantalla, no la esquina superior. Por eso toda app de
 * mapas seria (Maps, Uber, Life360) pone la lista abajo y deja el mapa
 * visible detras.
 *
 * ARRASTRE
 * --------
 * Se puede cerrar arrastrando hacia abajo, que es lo que la gente intenta por
 * instinto antes de buscar una X. Esta hecho con Pointer Events, que cubren
 * dedo, raton y lapiz con el mismo codigo, en vez de duplicar la logica para
 * touch y mouse.
 *
 * Solo cuenta el arrastre que empieza en el asa o en una zona ya arriba del
 * todo: si no, deslizar la lista de unidades cerraria la hoja en vez de
 * desplazarla, que es de las cosas que peor se sienten en una interfaz movil.
 */

import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';

interface Props {
  readonly abierta: boolean;
  readonly onCerrar: () => void;
  /** Texto del encabezado. Tambien es el nombre accesible del dialogo. */
  readonly titulo: string;
  /** Altura maxima. Siempre queda algo de mapa visible arriba. */
  readonly altura?: string;
  readonly children: ReactNode;
}

/** A partir de cuantos pixeles de arrastre se cierra al soltar. */
const UMBRAL_CIERRE = 90;

export function HojaMovil({
  abierta,
  onCerrar,
  titulo,
  altura = '72dvh',
  children,
}: Props): JSX.Element {
  const [arrastre, setArrastre] = useState(0);
  /*
   * Que haya un gesto en curso es ESTADO, no una referencia, aunque la
   * posicion inicial si lo sea. De ello depende si la hoja lleva transicion o
   * no, y eso se decide durante el render: leer un ref ahi no esta permitido
   * -React no vuelve a renderizar cuando cambia- y la regla `react-hooks/refs`
   * lo marca con razon.
   */
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef<number | null>(null);

  // Escape cierra: es gratis y hace la hoja utilizable con teclado.
  useEffect(() => {
    if (!abierta) return undefined;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => {
      window.removeEventListener('keydown', alPulsar);
    };
  }, [abierta, onCerrar]);

  const alBajar = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    inicio.current = e.clientY;
    setArrastrando(true);
    // Captura del puntero: el dedo puede salirse del asa a media pasada y el
    // gesto tiene que seguir llegando aqui, no al elemento de debajo.
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const alMover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (inicio.current === null) return;
    // Solo hacia abajo: tirar hacia arriba no debe despegar la hoja del borde.
    const delta = Math.max(0, e.clientY - inicio.current);
    setArrastre(delta);
  }, []);

  const alSoltar = useCallback(() => {
    if (inicio.current === null) return;
    inicio.current = null;
    setArrastrando(false);
    setArrastre((d) => {
      if (d > UMBRAL_CIERRE) onCerrar();
      return 0;
    });
  }, [onCerrar]);

  return (
    <>
      {/*
        Velo. Se atenua con el arrastre para que el gesto tenga respuesta
        visual inmediata: sin eso, la hoja se mueve y el fondo no, y el
        conjunto se siente roto.
      */}
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={abierta ? 0 : -1}
        onClick={onCerrar}
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 md:hidden ${
          abierta ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={
          arrastrando && arrastre > 0
            ? { opacity: Math.max(0, 1 - arrastre / 260) }
            : undefined
        }
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        aria-hidden={!abierta}
        className={`panel borde fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t
                    sombra-alta md:hidden ${
                      abierta ? '' : 'pointer-events-none'
                    }`}
        style={{
          height: altura,
          // Sin arrastre la transicion es suave; con el dedo encima NO puede
          // haberla, o la hoja iria por detras del gesto.
          transform: abierta
            ? `translateY(${String(arrastrando ? arrastre : 0)}px)`
            : 'translateY(100%)',
          transition: arrastrando ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/*
          Asa. Es la zona de arrastre y ademas la senal visual de que esto se
          puede arrastrar: sin la barrita, nadie lo intenta.
          `touch-action: none` evita que el navegador se quede el gesto para
          hacer scroll o "pull to refresh".
        */}
        <div
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          className="sin-seleccion shrink-0 cursor-grab touch-none px-4 pt-2.5 pb-1 active:cursor-grabbing"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-black/20 dark:bg-white/25" />
        </div>

        <div className="borde flex shrink-0 items-center justify-between gap-2 border-b px-4 pb-2">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="texto-suave toque -mr-2 flex items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/*
          `overscroll-contain` corta el encadenamiento del scroll: al llegar al
          final de la lista, el gesto deja de propagarse a la pagina de detras.
        */}
        <div className="segura-abajo min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
