/**
 * Exportación del historial a formatos abiertos.
 *
 * Los tres formatos se generan aquí en vez de traer una biblioteca: son
 * documentos de texto con una estructura simple, y una dependencia para esto
 * pesaría más que el código que sustituye.
 *
 * No se genera .xlsx a propósito. Es un ZIP con varios XML dentro y sí exige
 * biblioteca; el CSV lo abre Excel igual de bien y no ata el proyecto a un
 * paquete más.
 *
 * Funciones puras: entran los datos, sale la cadena.
 */

import type { HistoryPoint } from '../../traccar/types.ts';

/** Escapa un valor para CSV: comillas dobles y separadores. */
function celda(valor: string | number | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  // Excel rompe la fila si el valor trae comas, comillas o saltos de línea.
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Escapa texto para XML. */
function xml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DatosExportacion {
  readonly unidad: string;
  readonly desde: string;
  readonly hasta: string;
  readonly puntos: readonly HistoryPoint[];
}

/**
 * CSV con separador de punto y coma.
 *
 * Excel en español interpreta la coma como separador decimal, así que un CSV
 * separado por comas le mete todo en una sola columna. El punto y coma es lo
 * que espera en configuración regional española o latinoamericana.
 */
export function aCsv(datos: DatosExportacion): string {
  const filas = [
    ['fecha_hora', 'latitud', 'longitud', 'velocidad_kmh', 'rumbo_grados'].join(';'),
    ...datos.puntos.map((p) =>
      [
        celda(p.fixTime),
        celda(p.latitude.toFixed(6)),
        celda(p.longitude.toFixed(6)),
        celda(Math.round(p.speedKmh)),
        celda(Math.round(p.course)),
      ].join(';'),
    ),
  ];
  // Sin marca de orden de bytes al principio, Excel abre el archivo como ANSI
  // y destroza todos los acentos.
  //
  // Se escribe con `String.fromCharCode` y no como carácter literal dentro de
  // la plantilla: literal es invisible en cualquier editor, y cualquiera puede
  // borrarlo sin notar que rompe la exportación.
  const marcaUtf8 = String.fromCharCode(0xfeff);
  return `${marcaUtf8}${filas.join('\r\n')}\r\n`;
}

/** GPX 1.1: lo abren Google Earth, QGIS, Garmin y casi cualquier cosa. */
export function aGpx(datos: DatosExportacion): string {
  const puntos = datos.puntos
    .map(
      (p) =>
        `      <trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}">` +
        `<time>${p.fixTime}</time>` +
        `<course>${p.course.toFixed(1)}</course>` +
        // GPX guarda la velocidad en METROS POR SEGUNDO, no en km/h.
        `<speed>${(p.speedKmh / 3.6).toFixed(2)}</speed>` +
        `</trkpt>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="rastreo-propio" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${xml(datos.unidad)}</name>
    <time>${datos.desde}</time>
  </metadata>
  <trk>
    <name>${xml(datos.unidad)} · ${datos.desde.slice(0, 10)}</name>
    <trkseg>
${puntos}
    </trkseg>
  </trk>
</gpx>
`;
}

/** GeoJSON: una LineString con el recorrido y sus propiedades. */
export function aGeoJson(datos: DatosExportacion): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            // GeoJSON va en [longitud, latitud]. Invertirlo es el error clásico.
            coordinates: datos.puntos.map((p) => [
              Number(p.longitude.toFixed(6)),
              Number(p.latitude.toFixed(6)),
            ]),
          },
          properties: {
            unidad: datos.unidad,
            desde: datos.desde,
            hasta: datos.hasta,
            puntos: datos.puntos.length,
          },
        },
      ],
    },
    null,
    2,
  );
}

export type Formato = 'csv' | 'gpx' | 'geojson';

export const TIPOS_MIME: Readonly<Record<Formato, string>> = {
  csv: 'text/csv; charset=utf-8',
  gpx: 'application/gpx+xml; charset=utf-8',
  geojson: 'application/geo+json; charset=utf-8',
};

export function exportar(formato: Formato, datos: DatosExportacion): string {
  switch (formato) {
    case 'csv':
      return aCsv(datos);
    case 'gpx':
      return aGpx(datos);
    case 'geojson':
      return aGeoJson(datos);
  }
}

/** Nombre de archivo seguro para cualquier sistema de archivos. */
export function nombreArchivo(unidad: string, desde: string, formato: Formato): string {
  const limpio = unidad
    .normalize('NFD')
    // Se quitan los acentos y todo lo que no sea alfanumérico: un nombre como
    // "Nissan NP300 · Reparto 1" produce un archivo que Windows rechaza.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${limpio || 'unidad'}_${desde.slice(0, 10)}.${formato}`;
}
