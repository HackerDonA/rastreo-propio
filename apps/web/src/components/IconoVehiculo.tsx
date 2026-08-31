import type { JSX } from 'react';

import { tipoDe } from '../lib/vehiculos.ts';

interface Props {
  readonly categoria: string | null;
  readonly className?: string;
}

/**
 * Silueta del vehiculo segun su categoria.
 *
 * Se inyecta el trazo con dangerouslySetInnerHTML porque los trazos son
 * constantes definidas en nuestro propio codigo (lib/vehiculos.ts), nunca
 * contenido que venga del servidor ni del usuario. No hay superficie de
 * inyeccion: la categoria se normaliza contra una lista cerrada antes de
 * elegir el trazo.
 */
export function IconoVehiculo({ categoria, className }: Props): JSX.Element {
  const tipo = tipoDe(categoria);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={tipo.etiqueta}
      dangerouslySetInnerHTML={{ __html: tipo.trazo }}
    />
  );
}
