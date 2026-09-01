/**
 * Pruebas del conversor de geometrías.
 *
 * El error que estas pruebas existen para atrapar es invertir latitud y
 * longitud. No lanza ninguna excepción: solo coloca la geocerca en otro
 * continente, y el síntoma aparece días después como "las alertas de entrada
 * nunca se disparan".
 */

import { describe, expect, it } from 'vitest';

import { aWkt, circuloAPoligono, desdeWkt, WktError } from './wkt.ts';

// Zócalo de la Ciudad de México.
const LAT = 19.4326;
const LON = -99.1332;

describe('desdeWkt · círculos', () => {
  it('lee latitud primero, como escribe Traccar', () => {
    const g = desdeWkt(`CIRCLE (${String(LAT)} ${String(LON)}, 500)`);
    expect(g.tipo).toBe('circulo');
    if (g.tipo !== 'circulo') throw new Error('tipo inesperado');
    expect(g.latitud).toBe(LAT);
    expect(g.longitud).toBe(LON);
    expect(g.radio).toBe(500);
  });

  it('no confunde el signo: la CDMX queda en longitud negativa', () => {
    // Si se invirtieran los ejes, la longitud saldría 19.43 (China) y la
    // latitud -99.13, que ni siquiera es una latitud válida.
    const g = desdeWkt('CIRCLE (19.4326 -99.1332, 500)');
    if (g.tipo !== 'circulo') throw new Error('tipo inesperado');
    expect(g.longitud).toBeLessThan(0);
    expect(Math.abs(g.latitud)).toBeLessThanOrEqual(90);
  });

  it('tolera espacios de más', () => {
    const g = desdeWkt('  CIRCLE (  19.4326   -99.1332 ,  250.5 )  ');
    if (g.tipo !== 'circulo') throw new Error('tipo inesperado');
    expect(g.radio).toBe(250.5);
  });
});

describe('desdeWkt · polígonos', () => {
  it('invierte cada vértice a orden GeoJSON', () => {
    const g = desdeWkt('POLYGON ((19.43 -99.13, 19.44 -99.12, 19.42 -99.11))');
    expect(g.tipo).toBe('poligono');
    if (g.tipo !== 'poligono') throw new Error('tipo inesperado');
    expect(g.puntos).toHaveLength(3);
    // GeoJSON: [longitud, latitud].
    expect(g.puntos[0]).toEqual([-99.13, 19.43]);
  });

  it('rechaza un polígono con menos de 3 vértices', () => {
    expect(() => desdeWkt('POLYGON ((19.43 -99.13, 19.44 -99.12))')).toThrow(WktError);
  });
});

describe('desdeWkt · entradas inválidas', () => {
  it('rechaza una geometría que no se soporta', () => {
    expect(() => desdeWkt('LINESTRING (1 2, 3 4)')).toThrow(WktError);
  });

  it('rechaza números que no lo son', () => {
    expect(() => desdeWkt('CIRCLE (abc -99.13, 500)')).toThrow(WktError);
  });

  it('rechaza un círculo sin radio', () => {
    expect(() => desdeWkt('CIRCLE (19.43 -99.13)')).toThrow(WktError);
  });
});

describe('aWkt', () => {
  it('escribe el círculo en el orden de Traccar', () => {
    const wkt = aWkt({ tipo: 'circulo', latitud: LAT, longitud: LON, radio: 500 });
    expect(wkt).toBe('CIRCLE (19.4326 -99.1332, 500)');
  });

  it('escribe el polígono invirtiendo de GeoJSON a lat lon', () => {
    const wkt = aWkt({
      tipo: 'poligono',
      puntos: [
        [-99.13, 19.43],
        [-99.12, 19.44],
        [-99.11, 19.42],
      ],
    });
    expect(wkt).toBe('POLYGON ((19.43 -99.13, 19.44 -99.12, 19.42 -99.11))');
  });

  it('no usa notación científica', () => {
    // String(0.0000001) da "1e-7", que Traccar no sabe leer.
    const wkt = aWkt({ tipo: 'circulo', latitud: 0.0000001, longitud: LON, radio: 10 });
    expect(wkt).not.toContain('e-');
    expect(wkt).not.toContain('e+');
  });

  it('quita el vértice de cierre repetido', () => {
    // Los editores de mapas suelen repetir el primer punto al final.
    const wkt = aWkt({
      tipo: 'poligono',
      puntos: [
        [-99.13, 19.43],
        [-99.12, 19.44],
        [-99.11, 19.42],
        [-99.13, 19.43],
      ],
    });
    expect(wkt.match(/,/g)).toHaveLength(2); // 3 vértices = 2 comas
  });

  it('rechaza un radio de cero', () => {
    expect(() => aWkt({ tipo: 'circulo', latitud: LAT, longitud: LON, radio: 0 })).toThrow(
      WktError,
    );
  });
});

describe('ida y vuelta', () => {
  it('un círculo sobrevive la conversión completa', () => {
    const original = 'CIRCLE (19.4326 -99.1332, 750)';
    expect(aWkt(desdeWkt(original))).toBe(original);
  });

  it('un polígono sobrevive la conversión completa', () => {
    const original = 'POLYGON ((19.43 -99.13, 19.44 -99.12, 19.42 -99.11))';
    expect(aWkt(desdeWkt(original))).toBe(original);
  });
});

describe('circuloAPoligono', () => {
  it('genera un anillo cerrado', () => {
    const puntos = circuloAPoligono({
      tipo: 'circulo',
      latitud: LAT,
      longitud: LON,
      radio: 500,
    });
    expect(puntos).toHaveLength(65); // 64 lados + el cierre
    expect(puntos[0]).toEqual(puntos[64]);
  });

  it('corrige la longitud por la latitud, para que no salga ovalado', () => {
    // A 19° de latitud, un grado de longitud mide ~cos(19°) = 0.945 de lo que
    // mide uno de latitud. Sin corregirlo, el circulo se vería aplastado.
    const puntos = circuloAPoligono(
      { tipo: 'circulo', latitud: LAT, longitud: LON, radio: 1000 },
      4,
    );
    const este = puntos[0];
    const norte = puntos[1];
    if (este === undefined || norte === undefined) throw new Error('faltan puntos');

    const deltaLon = Math.abs(este[0] - LON);
    const deltaLat = Math.abs(norte[1] - LAT);
    // El desplazamiento en grados de longitud debe ser MAYOR que el de
    // latitud, justo porque cada grado de longitud abarca menos metros.
    expect(deltaLon).toBeGreaterThan(deltaLat);
  });

  it('produce un radio real cercano al pedido', () => {
    const radio = 1000;
    const puntos = circuloAPoligono({ tipo: 'circulo', latitud: LAT, longitud: LON, radio });
    const norte = puntos[16]; // un cuarto de vuelta: hacia el norte
    if (norte === undefined) throw new Error('falta el punto');
    const metros = Math.abs(norte[1] - LAT) * 111_320;
    expect(metros).toBeGreaterThan(radio * 0.98);
    expect(metros).toBeLessThan(radio * 1.02);
  });
});
