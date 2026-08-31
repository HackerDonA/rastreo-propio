import { describe, expect, it } from 'vitest';

import { simplifyRoute, simplifyToBudget, type SimplifiablePoint } from './simplify.ts';

const punto = (longitude: number, latitude: number): SimplifiablePoint => ({
  longitude,
  latitude,
});

describe('simplifyRoute', () => {
  it('reduce una recta a sus dos extremos', () => {
    // Cien puntos sobre una linea recta no aportan nada: la linea se ve igual
    // con dos.
    const recta = Array.from({ length: 100 }, (_, i) => punto(i * 0.001, 0));
    const resultado = simplifyRoute(recta, 0.0001);
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual(recta[0]);
    expect(resultado[1]).toEqual(recta[99]);
  });

  it('conserva los puntos donde la ruta cambia de direccion', () => {
    // Una L: el vertice es justo lo que NO se puede perder.
    const ele = [punto(0, 0), punto(1, 0), punto(2, 0), punto(2, 1), punto(2, 2)];
    const resultado = simplifyRoute(ele, 0.1);
    expect(resultado).toContainEqual(punto(2, 0));
    expect(resultado).toHaveLength(3);
  });

  it('devuelve la ruta tal cual si tiene dos puntos o menos', () => {
    expect(simplifyRoute([], 0.1)).toHaveLength(0);
    expect(simplifyRoute([punto(0, 0)], 0.1)).toHaveLength(1);
    expect(simplifyRoute([punto(0, 0), punto(1, 1)], 0.1)).toHaveLength(2);
  });

  it('conserva siempre el primero y el ultimo punto', () => {
    const ruta = Array.from({ length: 50 }, (_, i) => punto(i * 0.01, Math.sin(i) * 0.01));
    const resultado = simplifyRoute(ruta, 0.05);
    expect(resultado[0]).toEqual(ruta[0]);
    expect(resultado.at(-1)).toEqual(ruta.at(-1));
  });
});

describe('simplifyToBudget', () => {
  it('no toca la ruta si ya cabe en el presupuesto', () => {
    const ruta = Array.from({ length: 50 }, (_, i) => punto(i * 0.01, i * 0.01));
    expect(simplifyToBudget(ruta, 100)).toHaveLength(50);
  });

  it('respeta el tope con una ruta grande y sinuosa', () => {
    // Simula un mes de historial: ~170 000 puntos es lo que produce una unidad
    // reportando cada 15 segundos.
    const ruta = Array.from({ length: 20_000 }, (_, i) =>
      punto(-99.13 + Math.sin(i / 40) * 0.05, 19.43 + Math.cos(i / 55) * 0.05),
    );
    const resultado = simplifyToBudget(ruta, 3_000);
    expect(resultado.length).toBeLessThanOrEqual(3_000);
    expect(resultado.length).toBeGreaterThan(1);
    expect(resultado[0]).toEqual(ruta[0]);
  });

  it('conserva el ultimo punto incluso al recortar de forma uniforme', () => {
    // Caso extremo: puntos totalmente dispersos, donde ninguna tolerancia
    // alcanza y se cae al recorte uniforme.
    const ruta = Array.from({ length: 5_000 }, (_, i) =>
      punto((i % 2) * 40 - 20, ((i * 7) % 60) - 30),
    );
    const resultado = simplifyToBudget(ruta, 100);
    expect(resultado.length).toBeLessThanOrEqual(101);
    expect(resultado.at(-1)).toEqual(ruta.at(-1));
  });
});
