/**
 * Deteccion de pantalla chica.
 *
 * POR QUE NO BASTA CON CLASES DE TAILWIND
 * ---------------------------------------
 * Para esconder y mostrar cosas, `md:` sobra y es lo correcto: no cuesta
 * JavaScript y funciona antes de que React monte nada.
 *
 * Pero el movil y el escritorio no solo se ven distinto aqui: se comportan
 * distinto. La lista de unidades es un cajon lateral en escritorio y una hoja
 * que sube desde abajo en el telefono, con arrastre para cerrarla. Eso son dos
 * arboles de componentes con estado propio, no el mismo con otro CSS. Montar
 * los dos y esconder uno duplicaria el DOM y los `aria-label`, y dejaria
 * elementos interactivos invisibles al alcance del lector de pantalla.
 *
 * POR QUE useSyncExternalStore
 * ----------------------------
 * Es la forma que React 19 espera para leer algo que vive fuera de React y
 * cambia solo. Con `useState` + `useEffect` habria un primer render con el
 * valor equivocado -y ademas la regla `react-hooks/set-state-in-effect` lo
 * marca, con razon: provoca un render en cascada en cada montaje.
 */

import { useSyncExternalStore } from 'react';

/**
 * Debe coincidir con el breakpoint `md` de Tailwind (48rem = 768px).
 *
 * Si algun dia se cambia uno hay que cambiar el otro, o la interfaz quedaria
 * en un estado imposible: la barra inferior de movil junto al panel lateral de
 * escritorio.
 */
const CONSULTA = '(max-width: 47.999rem)';

function suscribir(alCambiar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener('change', alCambiar);
  return () => {
    mq.removeEventListener('change', alCambiar);
  };
}

function leer(): boolean {
  return window.matchMedia(CONSULTA).matches;
}

/**
 * Valor durante el renderizado en servidor.
 *
 * Esta aplicacion no lo usa, pero el argumento es obligatorio y devolver
 * `false` es lo prudente: si algun dia se prerenderiza, el escritorio es el
 * diseno que no depende de gestos tactiles.
 */
function leerEnServidor(): boolean {
  return false;
}

/** ¿Estamos en una pantalla de telefono? */
export function useEsMovil(): boolean {
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}
