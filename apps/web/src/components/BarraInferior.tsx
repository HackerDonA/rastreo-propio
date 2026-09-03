/**
 * Barra de navegacion inferior. Solo en telefono.
 *
 * POR QUE ABAJO Y NO ARRIBA
 * -------------------------
 * Sujetando el telefono con una mano, el pulgar cubre comodamente el tercio
 * inferior de la pantalla. La esquina superior izquierda -donde estaban estas
 * pestanas- es justo el punto mas incomodo de alcanzar, y en un telefono
 * grande obliga a recolocar la mano.
 *
 * Es tambien lo que la gente ya tiene aprendido: iOS y Android ponen ahi la
 * navegacion principal desde hace anos. Una interfaz que respeta esa costumbre
 * no hay que explicarla.
 *
 * En escritorio esta barra no aparece: alli el raton llega igual de rapido a
 * cualquier sitio y las pestanas de arriba estan mas cerca del contenido que
 * gobiernan.
 */

import type { JSX } from 'react';

export type Vista = 'mapa' | 'historial' | 'mantenimientos';

interface Props {
  readonly vista: Vista;
  readonly onCambiar: (v: Vista) => void;
  /** Cuantos avisos de mantenimiento hay abiertos, para el punto rojo. */
  readonly alertas?: number;
}

interface Item {
  readonly id: Vista;
  readonly etiqueta: string;
  readonly icono: JSX.Element;
}

const ITEMS: readonly Item[] = [
  {
    id: 'mapa',
    etiqueta: 'Mapa',
    icono: (
      <>
        <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" strokeLinejoin="round" />
        <path d="M9 4v13M15 7v13" />
      </>
    ),
  },
  {
    id: 'historial',
    etiqueta: 'Historial',
    icono: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'mantenimientos',
    etiqueta: 'Servicio',
    icono: (
      <>
        <path
          d="M14.7 6.3a4 4 0 0 1 5 5l-8.4 8.4a2 2 0 0 1-2.8-2.8l8.4-8.4a1 1 0 0 0-1.4-1.4l-1.4 1.4"
          strokeLinejoin="round"
        />
        <path d="M6.5 9.5 4 7l1.5-1.5L8 8" strokeLinejoin="round" />
      </>
    ),
  },
];

export function BarraInferior({ vista, onCambiar, alertas = 0 }: Props): JSX.Element {
  return (
    <nav
      /*
       * `segura-abajo` aparta los botones de la barra de gestos del iPhone.
       * Sin eso, el boton del medio cae justo debajo de la raya de inicio y
       * cada toque es una moneda al aire entre pulsarlo y salirse de la app.
       */
      className="borde panel segura-abajo segura-lados z-30 flex shrink-0 border-t md:hidden"
      aria-label="Secciones"
    >
      {ITEMS.map((it) => {
        const activo = vista === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => {
              onCambiar(it.id);
            }}
            aria-current={activo ? 'page' : undefined}
            className={`toque relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium transition ${
              activo ? 'acento' : 'texto-suave'
            }`}
          >
            <span className="relative">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={activo ? 2.1 : 1.7}
                className="h-5.5 w-5.5"
                aria-hidden="true"
              >
                {it.icono}
              </svg>
              {it.id === 'mantenimientos' && alertas > 0 && (
                /*
                 * Un punto, no un numero. En un icono de 22 px un "12" es
                 * ilegible; lo que hace falta saber de un vistazo es que hay
                 * algo pendiente, y el numero exacto esta a un toque.
                 */
                <span
                  className="panel absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2"
                  aria-label={`${String(alertas)} avisos abiertos`}
                />
              )}
            </span>
            {it.etiqueta}
          </button>
        );
      })}
    </nav>
  );
}
