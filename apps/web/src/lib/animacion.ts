/**
 * Interpolación de posiciones para que los vehículos se deslicen por el mapa.
 *
 * EL PROBLEMA
 * -----------
 * El relay agrupa las posiciones y emite cada ~750 ms. Si el marcador salta
 * directamente a cada coordenada nueva, el resultado es una flota de vehículos
 * teletransportándose: se ve entrecortado y hace difícil seguir uno con la
 * vista.
 *
 * Interpolando entre la posición anterior y la nueva a lo largo de esa misma
 * ventana, el vehículo recorre el tramo de forma continua. Los datos son
 * exactamente los mismos; lo que cambia es que el ojo puede seguirlos.
 *
 * Funciones puras y sin dependencias, para poder probarlas.
 */

export type Coord = readonly [number, number];

export interface Trayecto {
  readonly desde: Coord;
  readonly hasta: Coord;
  /** Marca de tiempo en la que arrancó el trayecto (performance.now()). */
  readonly inicio: number;
  /** Cuánto debe durar el recorrido, en milisegundos. */
  readonly duracion: number;
}

/**
 * Suavizado de entrada y salida.
 *
 * Un movimiento lineal se ve mecánico justo en los extremos: arranca y frena
 * de golpe. Esta curva acelera al principio y desacelera al final, que es como
 * se mueve un vehículo de verdad entre dos reportes.
 */
export function suavizar(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Posición del trayecto en el instante `ahora`. */
export function posicionEn(trayecto: Trayecto, ahora: number): Coord {
  const { desde, hasta, inicio, duracion } = trayecto;
  if (duracion <= 0) return hasta;

  const avance = suavizar((ahora - inicio) / duracion);
  return [
    desde[0] + (hasta[0] - desde[0]) * avance,
    desde[1] + (hasta[1] - desde[1]) * avance,
  ];
}

/** `true` cuando el trayecto ya llegó a su destino. */
export function terminado(trayecto: Trayecto, ahora: number): boolean {
  return ahora - trayecto.inicio >= trayecto.duracion;
}

/**
 * Diferencia angular más corta entre dos rumbos, en grados.
 *
 * Sin esto, pasar de 350° a 10° hace girar el ícono 340 grados hacia atrás en
 * vez de 20 hacia delante. Es un detalle que se nota mucho: el vehículo parece
 * dar un trompo cada vez que cruza el norte.
 */
export function diferenciaAngular(desde: number, hasta: number): number {
  return ((((hasta - desde) % 360) + 540) % 360) - 180;
}

/** Rumbo interpolado, tomando siempre el giro más corto. */
export function rumboEn(desde: number, hasta: number, avance: number): number {
  const suave = suavizar(avance);
  return (((desde + diferenciaAngular(desde, hasta) * suave) % 360) + 360) % 360;
}

/**
 * Distancia aproximada en metros entre dos coordenadas.
 *
 * Se usa para decidir si un cambio de posición merece animarse: un salto de
 * medio kilómetro no es el vehículo moviéndose, es el GPS corrigiendo o una
 * unidad que acaba de aparecer, y animarlo produce un deslizamiento falso a
 * través de la ciudad.
 */
export function distanciaMetros(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Por encima de esta distancia el salto se aplica de golpe, sin animar. */
export const SALTO_MAXIMO_M = 2_000;
