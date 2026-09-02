/**
 * Invitación a instalar la aplicación en la pantalla de inicio.
 *
 * POR QUÉ NO ES UN BOTÓN Y YA
 * ---------------------------
 * Hay dos mundos distintos:
 *
 * - **Chrome, Edge y Android** disparan `beforeinstallprompt` y permiten abrir
 *   el diálogo nativo cuando queramos. Ahí sí es un botón.
 * - **Safari en iPhone y iPad** no ofrece nada por API. La instalación es
 *   manual: Compartir → Agregar a inicio. Lo único que se puede hacer es
 *   explicárselo al usuario, y explicarlo mal es peor que no decir nada.
 *
 * Se muestra una sola vez y se recuerda el descarte, porque una barra que
 * reaparece en cada carga acaba siendo ruido que se ignora.
 */

import { useEffect, useState, type JSX } from 'react';

import {
  alCambiarInstalacion,
  esIOS,
  estaInstalada,
  instalar,
} from '../lib/instalable.ts';

const CLAVE_DESCARTE = 'instalarDescartado';

function fueDescartada(): boolean {
  try {
    return localStorage.getItem(CLAVE_DESCARTE) === 'si';
  } catch {
    return false;
  }
}

function recordarDescarte(): void {
  try {
    localStorage.setItem(CLAVE_DESCARTE, 'si');
  } catch {
    // Modo privado: se volverá a ofrecer. Es un mal menor.
  }
}

/**
 * El icono de Compartir de iOS, dibujado a mano.
 *
 * Apple lo publica como símbolo de SF Symbols, pero ese glifo vive en el área
 * de uso privado de Unicode: fuera de un dispositivo Apple con la fuente
 * cargada se ve como un cuadro vacío. Un SVG se ve igual en todas partes.
 */
function IconoCompartir(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 -translate-y-px align-text-bottom"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export function Instalar(): JSX.Element | null {
  const [disponible, setDisponible] = useState(false);
  const [oculta, setOculta] = useState(() => fueDescartada() || estaInstalada());
  const [ios] = useState(esIOS);

  useEffect(() => alCambiarInstalacion(setDisponible), []);

  // En iOS no hay evento que esperar: si no está instalada, se ofrece la
  // instrucción manual.
  const mostrar = !oculta && (disponible || ios);
  if (!mostrar) return null;

  const cerrar = (): void => {
    recordarDescarte();
    setOculta(true);
  };

  return (
    <div className="segura-abajo pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3">
      <div className="tarjeta aparecer pointer-events-auto mb-2 flex w-full max-w-md items-center gap-3 p-3">
        <img src="/icono-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-medium">Instalar Rastreo</p>
          <p className="texto-suave text-xs leading-snug">
            {ios ? (
              <>
                Toca <IconoCompartir /> Compartir y luego{' '}
                <strong className="font-medium">Agregar a inicio</strong>.
              </>
            ) : (
              'Ábrela desde el icono, sin barra del navegador.'
            )}
          </p>
        </div>

        {!ios && (
          <button
            type="button"
            onClick={() => {
              void instalar().then((acepto) => {
                if (acepto) setOculta(true);
              });
            }}
            className="toque shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Instalar
          </button>
        )}

        <button
          type="button"
          onClick={cerrar}
          aria-label="No instalar"
          className="toque texto-suave shrink-0 rounded-lg px-2 text-lg leading-none transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          ×
        </button>
      </div>
    </div>
  );
}
