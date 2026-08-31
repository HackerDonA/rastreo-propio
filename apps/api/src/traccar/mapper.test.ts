/**
 * Pruebas de las conversiones que, si se rompen, fallan en silencio.
 *
 * Una velocidad mal convertida no lanza ningun error: simplemente muestra 60
 * donde deberia decir 111, y nadie lo nota hasta que alguien compara con el
 * velocimetro del vehiculo.
 */

import { describe, expect, it } from 'vitest';

import { buildUnits, deriveState, toUnitPosition } from './mapper.ts';
import type { TraccarDevice, TraccarPosition } from './types.ts';

const posicionBase: TraccarPosition = {
  id: 1,
  deviceId: 10,
  deviceTime: '2026-08-31T12:00:00Z',
  fixTime: '2026-08-31T12:00:00Z',
  serverTime: '2026-08-31T12:00:00Z',
  valid: true,
  latitude: 19.4326,
  longitude: -99.1332,
  altitude: 2240,
  speed: 0,
  course: 90,
  attributes: {},
};

const unidadBase: TraccarDevice = {
  id: 10,
  name: 'Camioneta 1',
  uniqueId: 'SIM001',
  status: 'online',
  attributes: {},
};

describe('toUnitPosition', () => {
  it('convierte nudos a km/h', () => {
    // 27 nudos = 50.004 km/h. Traccar SIEMPRE guarda nudos.
    const resultado = toUnitPosition({ ...posicionBase, speed: 27 });
    expect(resultado.speedKmh).toBeCloseTo(50.004, 3);
  });

  it('convierte el odometro de metros a kilometros', () => {
    const resultado = toUnitPosition({
      ...posicionBase,
      attributes: { totalDistance: 125_500 },
    });
    expect(resultado.totalDistanceKm).toBe(125.5);
  });

  it('convierte las horas de motor de milisegundos a horas', () => {
    // Traccar acumula las horas de motor en milisegundos, no en horas.
    const resultado = toUnitPosition({
      ...posicionBase,
      attributes: { hours: 7_200_000 },
    });
    expect(resultado.engineHours).toBe(2);
  });

  it('devuelve null cuando el atributo no viene, en vez de NaN o cero', () => {
    // Cero significaria "odometro en cero", que es muy distinto de "no reportado".
    const resultado = toUnitPosition(posicionBase);
    expect(resultado.totalDistanceKm).toBeNull();
    expect(resultado.engineHours).toBeNull();
    expect(resultado.battery).toBeNull();
  });

  it('ignora atributos con un tipo inesperado', () => {
    const resultado = toUnitPosition({
      ...posicionBase,
      attributes: { totalDistance: 'muchos', ignition: 'si' },
    });
    expect(resultado.totalDistanceKm).toBeNull();
    expect(resultado.ignition).toBeNull();
  });
});

describe('deriveState', () => {
  const ahora = new Date('2026-08-31T12:00:00Z');

  it('marca en movimiento por encima del umbral', () => {
    const posicion = toUnitPosition({ ...posicionBase, speed: 10 }); // ~18.5 km/h
    expect(deriveState(unidadBase, posicion, ahora)).toBe('moving');
  });

  it('marca detenido con velocidad casi cero', () => {
    const posicion = toUnitPosition({ ...posicionBase, speed: 0.5 }); // ~0.9 km/h
    expect(deriveState(unidadBase, posicion, ahora)).toBe('stopped');
  });

  it('marca sin senal si el ultimo reporte es viejo, aunque Traccar diga online', () => {
    // Este es el caso que justifica no usar device.status a secas: Traccar puede
    // seguir considerando la unidad conectada mientras el GPS lleva rato mudo.
    const posicion = toUnitPosition({ ...posicionBase, fixTime: '2026-08-31T11:30:00Z' });
    expect(deriveState(unidadBase, posicion, ahora)).toBe('offline');
  });

  it('marca sin datos cuando no hay ninguna posicion', () => {
    expect(deriveState(unidadBase, null, ahora)).toBe('unknown');
  });
});

describe('buildUnits', () => {
  const ahora = new Date('2026-08-31T12:00:00Z');

  it('cruza unidades con posiciones sin hacer una consulta por unidad', () => {
    const unidades = buildUnits(
      [unidadBase, { ...unidadBase, id: 11, uniqueId: 'SIM002', name: 'Camioneta 2' }],
      [{ ...posicionBase, deviceId: 11, speed: 20 }],
      ahora,
    );

    expect(unidades).toHaveLength(2);
    expect(unidades[0]?.position).toBeNull();
    expect(unidades[0]?.state).toBe('unknown');
    expect(unidades[1]?.position?.speedKmh).toBeCloseTo(37.04, 2);
  });

  it('se queda con la posicion mas reciente si llegan varias de la misma unidad', () => {
    const unidades = buildUnits(
      [unidadBase],
      [
        { ...posicionBase, fixTime: '2026-08-31T11:59:00Z', speed: 5 },
        { ...posicionBase, fixTime: '2026-08-31T12:00:00Z', speed: 30 },
      ],
      ahora,
    );
    expect(unidades[0]?.position?.speedKmh).toBeCloseTo(55.56, 2);
  });
});
