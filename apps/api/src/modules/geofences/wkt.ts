/**
 * Conversión entre el WKT de Traccar y GeoJSON.
 *
 * ⚠️ LA TRAMPA: Traccar escribe LATITUD PRIMERO.
 *
 *     Traccar : CIRCLE (19.4326 -99.1332, 500)
 *     Traccar : POLYGON ((19.43 -99.13, 19.44 -99.12, ...))
 *     GeoJSON : [-99.1332, 19.4326]          <- longitud primero
 *
 * No es un capricho de este proyecto: se puede comprobar en
 * GeofenceCircle.java y GeofencePolygon.java aguas arriba, donde el `toWkt`
 * escribe `coordinate.lat()` antes que `coordinate.lon()`. Ojo además con que
 * eso tampoco es el WKT estándar, que va al revés.
 *
 * Invertir el orden no lanza ningún error: simplemente coloca la geocerca en
 * otro continente. Por eso estas funciones son puras y están probadas.
 */

export interface CirculoGeocerca {
  readonly tipo: 'circulo';
  readonly latitud: number;
  readonly longitud: number;
  /** Radio en metros. */
  readonly radio: number;
}

export interface PoligonoGeocerca {
  readonly tipo: 'poligono';
  /** Vértices en orden GeoJSON: [longitud, latitud]. */
  readonly puntos: readonly (readonly [number, number])[];
}

export type Geometria = CirculoGeocerca | PoligonoGeocerca;

export class WktError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WktError';
  }
}

const numero = (texto: string): number => {
  const n = Number(texto.trim());
  if (!Number.isFinite(n)) throw new WktError(`"${texto.trim()}" no es un número válido`);
  return n;
};

// ----------------------------------------------------------------------------
//  WKT de Traccar  ->  nuestra geometría
// ----------------------------------------------------------------------------

export function desdeWkt(wkt: string): Geometria {
  const limpio = wkt.trim();

  if (limpio.startsWith('CIRCLE')) {
    const contenido = limpio.slice(limpio.indexOf('(') + 1, limpio.lastIndexOf(')'));
    const [centro, radio] = contenido.split(',');
    if (centro === undefined || radio === undefined) {
      throw new WktError('CIRCLE mal formado: se esperaba "lat lon, radio"');
    }
    const partes = centro.trim().split(/\s+/);
    const lat = partes[0];
    const lon = partes[1];
    if (lat === undefined || lon === undefined) {
      throw new WktError('CIRCLE mal formado: el centro necesita latitud y longitud');
    }
    return {
      tipo: 'circulo',
      // Primero latitud: así lo escribe Traccar.
      latitud: numero(lat),
      longitud: numero(lon),
      radio: numero(radio),
    };
  }

  if (limpio.startsWith('POLYGON')) {
    const inicio = limpio.indexOf('((');
    const fin = limpio.indexOf('))');
    if (inicio === -1 || fin === -1) {
      throw new WktError('POLYGON mal formado: se esperaba "POLYGON ((lat lon, ...))"');
    }
    const puntos = limpio
      .slice(inicio + 2, fin)
      .split(',')
      .map((par) => {
        const partes = par.trim().split(/\s+/);
        const lat = partes[0];
        const lon = partes[1];
        if (lat === undefined || lon === undefined) {
          throw new WktError(`Vértice mal formado: "${par.trim()}"`);
        }
        // Se invierte al salir: nuestro tipo y GeoJSON usan [lon, lat].
        return [numero(lon), numero(lat)] as const;
      });

    if (puntos.length < 3) {
      throw new WktError('Un polígono necesita al menos 3 vértices');
    }
    return { tipo: 'poligono', puntos };
  }

  throw new WktError(`Tipo de geometría no soportado: ${limpio.slice(0, 20)}`);
}

// ----------------------------------------------------------------------------
//  Nuestra geometría  ->  WKT de Traccar
// ----------------------------------------------------------------------------

/**
 * Formatea un número sin notación científica.
 *
 * `String(0.0000001)` da "1e-7", que Traccar no sabe leer. No es hipotético:
 * un radio muy pequeño o una coordenada cerca de cero lo producen.
 */
const formatear = (n: number): string => {
  if (Number.isInteger(n)) return n.toFixed(0);
  return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
};

export function aWkt(geometria: Geometria): string {
  if (geometria.tipo === 'circulo') {
    if (geometria.radio <= 0) throw new WktError('El radio debe ser mayor que cero');
    // Latitud, longitud, radio. En ese orden.
    return `CIRCLE (${formatear(geometria.latitud)} ${formatear(geometria.longitud)}, ${formatear(geometria.radio)})`;
  }

  if (geometria.puntos.length < 3) {
    throw new WktError('Un polígono necesita al menos 3 vértices');
  }

  // Traccar cierra el polígono solo; si llega el primer punto repetido al
  // final, sobra y algunos cálculos lo cuentan dos veces.
  const puntos = [...geometria.puntos];
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (
    puntos.length > 3 &&
    primero !== undefined &&
    ultimo !== undefined &&
    primero[0] === ultimo[0] &&
    primero[1] === ultimo[1]
  ) {
    puntos.pop();
  }

  const cuerpo = puntos
    // Se invierte al entrar: de [lon, lat] al "lat lon" que espera Traccar.
    .map(([lon, lat]) => `${formatear(lat)} ${formatear(lon)}`)
    .join(', ');

  return `POLYGON ((${cuerpo}))`;
}

// ----------------------------------------------------------------------------
//  GeoJSON, para dibujar en el mapa
// ----------------------------------------------------------------------------

/** Metros por grado de latitud. Constante suficiente a escala de una ciudad. */
const METROS_POR_GRADO_LAT = 111_320;

/**
 * Convierte un círculo en un polígono aproximado para poder dibujarlo.
 *
 * MapLibre no tiene una capa de círculos en metros reales: `circle-radius` va
 * en píxeles y no escala con el zoom. Un polígono de 64 lados se ve como un
 * círculo y sí respeta la escala del mapa.
 *
 * La corrección por coseno de la latitud es necesaria: un grado de longitud
 * mide menos cuanto más lejos del ecuador, y sin ella el círculo saldría
 * ovalado.
 */
export function circuloAPoligono(
  circulo: CirculoGeocerca,
  lados = 64,
): (readonly [number, number])[] {
  const gradosLat = circulo.radio / METROS_POR_GRADO_LAT;
  const gradosLon =
    circulo.radio / (METROS_POR_GRADO_LAT * Math.cos((circulo.latitud * Math.PI) / 180));

  const puntos: (readonly [number, number])[] = [];
  for (let i = 0; i <= lados; i += 1) {
    const angulo = (i / lados) * 2 * Math.PI;
    puntos.push([
      circulo.longitud + gradosLon * Math.cos(angulo),
      circulo.latitud + gradosLat * Math.sin(angulo),
    ] as const);
  }
  return puntos;
}
