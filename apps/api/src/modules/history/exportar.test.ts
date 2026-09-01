import { describe, expect, it } from 'vitest';

import { aCsv, aGeoJson, aGpx, nombreArchivo } from './exportar.ts';
import type { HistoryPoint } from '../../traccar/types.ts';

const puntos: HistoryPoint[] = [
  { latitude: 19.4326, longitude: -99.1332, speedKmh: 54, course: 90, fixTime: '2026-08-31T12:00:00Z' },
  { latitude: 19.4426, longitude: -99.1232, speedKmh: 0, course: 180, fixTime: '2026-08-31T12:05:00Z' },
];

const datos = {
  unidad: 'Nissan NP300 · Reparto 1',
  desde: '2026-08-31T00:00:00Z',
  hasta: '2026-08-31T23:59:59Z',
  puntos,
};

describe('aCsv', () => {
  it('usa punto y coma, no coma', () => {
    // Excel en español trata la coma como separador decimal: un CSV con comas
    // le mete la fila entera en una sola columna.
    const csv = aCsv(datos);
    expect(csv).toContain('fecha_hora;latitud;longitud');
  });

  it('lleva BOM para que Excel reconozca UTF-8', () => {
    expect(aCsv(datos).charCodeAt(0)).toBe(0xfeff);
  });

  it('incluye una fila por punto más el encabezado', () => {
    expect(aCsv(datos).trim().split('\r\n')).toHaveLength(3);
  });
});

describe('aGpx', () => {
  it('convierte la velocidad a metros por segundo', () => {
    // GPX guarda m/s. 54 km/h = 15 m/s.
    expect(aGpx(datos)).toContain('<speed>15.00</speed>');
  });

  it('escapa el XML del nombre', () => {
    const gpx = aGpx({ ...datos, unidad: 'Unidad <A> & "B"' });
    expect(gpx).toContain('&lt;A&gt;');
    expect(gpx).toContain('&amp;');
    expect(gpx).not.toContain('<A>');
  });

  it('mantiene lat y lon en sus atributos correctos', () => {
    expect(aGpx(datos)).toContain('lat="19.432600" lon="-99.133200"');
  });
});

describe('aGeoJson', () => {
  it('escribe las coordenadas en orden longitud, latitud', () => {
    // Invertirlo es el error clásico y coloca la ruta en otro continente.
    const g = JSON.parse(aGeoJson(datos)) as {
      features: { geometry: { coordinates: number[][] } }[];
    };
    const primera = g.features[0]?.geometry.coordinates[0];
    expect(primera?.[0]).toBeLessThan(0); // longitud negativa: América
    expect(primera?.[1]).toBeGreaterThan(0); // latitud positiva: norte
  });

  it('produce JSON válido', () => {
    // El cuerpo va entre llaves para no DEVOLVER el `any` de JSON.parse: con
    // la forma de expresión, ese `any` se cuela en la firma de la función.
    expect(() => {
      JSON.parse(aGeoJson(datos));
    }).not.toThrow();
  });
});

describe('nombreArchivo', () => {
  it('quita acentos y caracteres que Windows rechaza', () => {
    const n = nombreArchivo('Toyota Hilux · Supervisión', '2026-08-31T00:00:00Z', 'gpx');
    expect(n).toBe('Toyota-Hilux-Supervision_2026-08-31.gpx');
    expect(n).not.toMatch(/[·:/?*|"<>]/);
  });

  it('no deja el nombre vacío aunque no quede nada utilizable', () => {
    expect(nombreArchivo('···', '2026-08-31T00:00:00Z', 'csv')).toBe(
      'unidad_2026-08-31.csv',
    );
  });
});
