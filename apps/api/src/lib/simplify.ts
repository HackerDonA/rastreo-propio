/**
 * Simplificacion de rutas con el algoritmo de Ramer-Douglas-Peucker.
 *
 * ¿Por que hace falta? Un mes de historial de una unidad que reporta cada 15
 * segundos son ~170 000 puntos. Mandarlos todos al navegador es varios
 * megabytes de JSON y un mapa que se arrastra, para dibujar una linea que a
 * simple vista es identica con 2 000 puntos.
 *
 * El algoritmo conserva la FORMA del recorrido: mantiene los puntos donde la
 * ruta cambia de direccion y descarta los que caen sobre una recta. Un tramo de
 * carretera de 20 km sin curvas se reduce a dos puntos; una glorieta conserva
 * todos los suyos.
 *
 * Implementado aqui en vez de traer una dependencia porque son 40 lineas y
 * necesitamos la variante que trabaja sobre nuestro propio tipo de punto.
 */

export interface SimplifiablePoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Distancia perpendicular al cuadrado de `point` respecto al segmento `a`-`b`.
 *
 * Se trabaja con el cuadrado para no calcular raices cuadradas dentro del
 * bucle, y en grados planos: a escala de una ciudad la distorsion es
 * irrelevante para decidir que punto conservar.
 */
function squaredSegmentDistance(
  point: SimplifiablePoint,
  a: SimplifiablePoint,
  b: SimplifiablePoint,
): number {
  let x = a.longitude;
  let y = a.latitude;
  let dx = b.longitude - x;
  let dy = b.latitude - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point.longitude - x) * dx + (point.latitude - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.longitude;
      y = b.latitude;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point.longitude - x;
  dy = point.latitude - y;
  return dx * dx + dy * dy;
}

/** Paso recursivo del algoritmo, marcando en `keep` los puntos a conservar. */
function simplifyStep<T extends SimplifiablePoint>(
  points: readonly T[],
  first: number,
  last: number,
  toleranceSq: number,
  keep: boolean[],
): void {
  let maxDistance = toleranceSq;
  let index = -1;

  const a = points[first];
  const b = points[last];
  if (a === undefined || b === undefined) return;

  for (let i = first + 1; i < last; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const distance = squaredSegmentDistance(point, a, b);
    if (distance > maxDistance) {
      index = i;
      maxDistance = distance;
    }
  }

  if (index === -1) return;

  keep[index] = true;
  simplifyStep(points, first, index, toleranceSq, keep);
  simplifyStep(points, index, last, toleranceSq, keep);
}

/**
 * Simplifica una ruta.
 *
 * @param tolerance Tolerancia en grados. 0.0001 grados son ~11 metros en el
 *                  ecuador, que a escala de una ciudad es imperceptible.
 */
export function simplifyRoute<T extends SimplifiablePoint>(
  points: readonly T[],
  tolerance: number,
): T[] {
  if (points.length <= 2) return [...points];

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  simplifyStep(points, 0, points.length - 1, tolerance * tolerance, keep);

  return points.filter((_, i) => keep[i] === true);
}

/**
 * Elige la tolerancia para no devolver mas de `maxPoints`.
 *
 * Prueba tolerancias crecientes hasta que el resultado quepa. Es preferible a
 * quedarse con un punto de cada N, que destruye la forma del recorrido: un
 * muestreo uniforme puede borrar justo la curva cerrada y conservar diez puntos
 * de una recta.
 */
export function simplifyToBudget<T extends SimplifiablePoint>(
  points: readonly T[],
  maxPoints: number,
): T[] {
  if (points.length <= maxPoints) return [...points];

  // ~1 m, ~5 m, ~28 m, ~110 m, ~550 m, ~1.1 km
  const tolerances = [0.00001, 0.00005, 0.00025, 0.001, 0.005, 0.01];
  for (const tolerance of tolerances) {
    const simplified = simplifyRoute(points, tolerance);
    if (simplified.length <= maxPoints) return simplified;
  }

  // Si ni la tolerancia mas alta basta (recorridos enormes), se recorta de forma
  // uniforme como ultimo recurso, conservando siempre el ultimo punto.
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (last !== undefined && sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}
