/**
 * Pruebas de la interpolación de movimiento.
 *
 * El caso que más importa es el cruce del norte: interpolar rumbos sin cuidado
 * hace que el vehículo dé un trompo completo cada vez que pasa de 350° a 10°.
 */

import { describe, expect, it } from 'vitest';

import {
  diferenciaAngular,
  distanciaMetros,
  posicionEn,
  rumboEn,
  suavizar,
  terminado,
} from './animacion.ts';

describe('suavizar', () => {
  it('respeta los extremos', () => {
    expect(suavizar(0)).toBe(0);
    expect(suavizar(1)).toBe(1);
  });

  it('pasa por la mitad justo a la mitad', () => {
    expect(suavizar(0.5)).toBeCloseTo(0.5, 5);
  });

  it('acota valores fuera de rango', () => {
    expect(suavizar(-1)).toBe(0);
    expect(suavizar(2)).toBe(1);
  });

  it('arranca más despacio que un movimiento lineal', () => {
    // Es lo que evita el tirón inicial.
    expect(suavizar(0.25)).toBeLessThan(0.25);
  });
});

describe('posicionEn', () => {
  const trayecto = {
    desde: [-99.13, 19.43] as const,
    hasta: [-99.11, 19.45] as const,
    inicio: 1000,
    duracion: 800,
  };

  it('empieza en el origen', () => {
    expect(posicionEn(trayecto, 1000)).toEqual([-99.13, 19.43]);
  });

  it('termina exactamente en el destino', () => {
    const p = posicionEn(trayecto, 1800);
    expect(p[0]).toBeCloseTo(-99.11, 10);
    expect(p[1]).toBeCloseTo(19.45, 10);
  });

  it('no se pasa del destino aunque llegue tarde', () => {
    expect(posicionEn(trayecto, 99_999)).toEqual([-99.11, 19.45]);
  });

  it('con duración cero salta directo, sin dividir entre cero', () => {
    expect(posicionEn({ ...trayecto, duracion: 0 }, 1000)).toEqual([-99.11, 19.45]);
  });
});

describe('terminado', () => {
  const t = { desde: [0, 0] as const, hasta: [1, 1] as const, inicio: 0, duracion: 500 };
  it('detecta el final', () => {
    expect(terminado(t, 499)).toBe(false);
    expect(terminado(t, 500)).toBe(true);
  });
});

describe('diferenciaAngular', () => {
  it('cruza el norte por el lado corto', () => {
    // De 350 a 10 son 20 grados hacia delante, no 340 hacia atrás.
    expect(diferenciaAngular(350, 10)).toBe(20);
    expect(diferenciaAngular(10, 350)).toBe(-20);
  });

  it('maneja giros normales', () => {
    expect(diferenciaAngular(90, 180)).toBe(90);
    expect(diferenciaAngular(180, 90)).toBe(-90);
  });

  it('nunca devuelve más de media vuelta', () => {
    for (let a = 0; a < 360; a += 7) {
      for (let b = 0; b < 360; b += 11) {
        expect(Math.abs(diferenciaAngular(a, b))).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('rumboEn', () => {
  it('interpola cruzando el norte sin dar la vuelta larga', () => {
    const medio = rumboEn(350, 10, 0.5);
    // A mitad de camino debe estar en el norte, no en el sur.
    expect(medio === 0 || medio > 355 || medio < 5).toBe(true);
  });

  it('siempre devuelve un ángulo entre 0 y 360', () => {
    for (let t = 0; t <= 1; t += 0.1) {
      const r = rumboEn(350, 10, t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });
});

describe('distanciaMetros', () => {
  it('mide un tramo conocido con precisión razonable', () => {
    // Un grado de latitud son ~111 km.
    const d = distanciaMetros([-99.13, 19.43], [-99.13, 20.43]);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('devuelve cero para el mismo punto', () => {
    expect(distanciaMetros([-99.13, 19.43], [-99.13, 19.43])).toBeCloseTo(0, 6);
  });
});
