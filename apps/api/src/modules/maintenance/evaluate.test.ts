/**
 * Pruebas del evaluador de mantenimientos.
 *
 * Es la lógica que decide si un vehículo necesita servicio. Un error aquí no
 * lanza excepción: solo avisa tarde, o avisa de más. La única forma de tener
 * confianza es probar los casos frontera.
 */

import { describe, expect, it } from 'vitest';

import { compararUrgencia, evaluarRegla, type Lecturas, type ReglaEvaluable } from './evaluate.ts';

const AHORA = new Date('2026-08-31T12:00:00Z');

function regla(cambios: Partial<ReglaEvaluable> = {}): ReglaEvaluable {
  return {
    id: 1,
    deviceId: 10,
    name: 'Cambio de aceite',
    intervalKm: null,
    intervalDays: null,
    intervalEngineHours: null,
    noticeKm: null,
    noticeDays: null,
    noticeEngineHours: null,
    baselineKm: null,
    baselineAt: new Date('2026-08-01T12:00:00Z'),
    baselineEngineHours: null,
    ...cambios,
  };
}

const sinLecturas: Lecturas = { odometerKm: null, engineHours: null };

describe('evaluarRegla · kilómetros', () => {
  const porKm = regla({ intervalKm: 5000, noticeKm: 500, baselineKm: 100_000 });

  it('está en orden cuando falta mucho', () => {
    const r = evaluarRegla(porKm, { odometerKm: 101_000, engineHours: null }, AHORA);
    expect(r.nivel).toBe('ok');
    expect(r.dimension).toBe('km');
    expect(r.mensaje).toBe('faltan 4,000 km');
  });

  it('avisa al entrar en el margen previo', () => {
    // 104,600 km = quedan 400, por debajo del aviso de 500.
    const r = evaluarRegla(porKm, { odometerKm: 104_600, engineHours: null }, AHORA);
    expect(r.nivel).toBe('due_soon');
    expect(r.mensaje).toBe('faltan 400 km');
  });

  it('marca vencido al pasarse', () => {
    const r = evaluarRegla(porKm, { odometerKm: 105_300, engineHours: null }, AHORA);
    expect(r.nivel).toBe('overdue');
    expect(r.mensaje).toBe('vencido hace 300 km');
  });

  it('marca vencido justo en el punto exacto, no un kilómetro después', () => {
    // Frontera: restante = 0 debe contar como vencido, no como "por vencer".
    const r = evaluarRegla(porKm, { odometerKm: 105_000, engineHours: null }, AHORA);
    expect(r.nivel).toBe('overdue');
  });

  it('limita el avance a 1 para que la barra no se desborde', () => {
    const r = evaluarRegla(porKm, { odometerKm: 200_000, engineHours: null }, AHORA);
    expect(r.avance).toBe(1);
    expect(r.mensaje).toBe('vencido hace 95,000 km');
  });

  it('no dice "faltan 0 km" cuando falta menos de un kilómetro', () => {
    // Redondear a entero a secas produce un mensaje que no informa nada.
    // Se vio de verdad con una regla de intervalo pequeño.
    const corta = regla({ intervalKm: 1, noticeKm: 0.4, baselineKm: 100 });
    const r = evaluarRegla(corta, { odometerKm: 100.7, engineHours: null }, AHORA);
    expect(r.mensaje).toBe('faltan 0.3 km');
  });

  it('dice "menos de 0.1" en lugar de cero cuando está justo en el filo', () => {
    const corta = regla({ intervalKm: 1, noticeKm: 0.4, baselineKm: 100 });
    const r = evaluarRegla(corta, { odometerKm: 100.97, engineHours: null }, AHORA);
    expect(r.mensaje).toBe('faltan menos de 0.1 km');
  });

  it('usa el 10 % del intervalo cuando no hay aviso configurado', () => {
    const sinAviso = regla({ intervalKm: 5000, noticeKm: null, baselineKm: 100_000 });
    // Quedan 400 km, que es menos que el 10 % de 5000 = 500.
    const r = evaluarRegla(sinAviso, { odometerKm: 104_600, engineHours: null }, AHORA);
    expect(r.nivel).toBe('due_soon');
  });
});

describe('evaluarRegla · fecha', () => {
  const porFecha = regla({
    intervalDays: 180,
    noticeDays: 15,
    baselineAt: new Date('2026-03-01T12:00:00Z'),
  });

  it('cuenta los días desde la línea base', () => {
    // 1 de marzo a 31 de agosto = 183 días. Ya se pasó de 180.
    const r = evaluarRegla(porFecha, sinLecturas, AHORA);
    expect(r.nivel).toBe('overdue');
    expect(r.dimension).toBe('date');
    expect(r.mensaje).toBe('vencido hace 3 días');
  });

  it('muestra los días como enteros, nunca "3.0 días"', () => {
    const r = evaluarRegla(porFecha, sinLecturas, AHORA);
    expect(r.mensaje).not.toContain('.');
  });

  it('dice "menos de 1 día" en lugar de un decimal', () => {
    const casi = regla({
      intervalDays: 180,
      baselineAt: new Date('2026-03-04T20:00:00Z'), // vence en pocas horas
    });
    const r = evaluarRegla(casi, sinLecturas, AHORA);
    expect(r.mensaje).toBe('faltan menos de 1 día');
  });

  it('funciona sin ninguna lectura de la unidad', () => {
    // Una regla por fecha debe evaluarse aunque el vehículo nunca haya
    // reportado: el tiempo pasa igual para un vehículo parado.
    const r = evaluarRegla(porFecha, sinLecturas, AHORA);
    expect(r.sinDatos).toBe(false);
  });
});

describe('evaluarRegla · lo que ocurra primero', () => {
  it('elige la dimensión más avanzada, no la primera configurada', () => {
    const mixta = regla({
      intervalKm: 5000,
      baselineKm: 100_000,
      intervalDays: 180,
      baselineAt: new Date('2026-08-01T12:00:00Z'), // 30 de 180 días = 17 %
    });
    // 4,500 de 5,000 km = 90 %. Los kilómetros van muy por delante.
    const r = evaluarRegla(mixta, { odometerKm: 104_500, engineHours: null }, AHORA);
    expect(r.dimension).toBe('km');
    expect(r.nivel).toBe('due_soon');
  });

  it('elige la fecha cuando el vehículo casi no se movió', () => {
    const mixta = regla({
      intervalKm: 5000,
      baselineKm: 100_000,
      intervalDays: 180,
      baselineAt: new Date('2026-01-01T12:00:00Z'), // 242 días: vencido
    });
    // Solo 200 de 5,000 km = 4 %.
    const r = evaluarRegla(mixta, { odometerKm: 100_200, engineHours: null }, AHORA);
    expect(r.dimension).toBe('date');
    expect(r.nivel).toBe('overdue');
  });

  it('devuelve el estado de todas las dimensiones, no solo de la crítica', () => {
    const mixta = regla({
      intervalKm: 5000,
      baselineKm: 100_000,
      intervalDays: 180,
      intervalEngineHours: 250,
      baselineEngineHours: 1000,
    });
    const r = evaluarRegla(mixta, { odometerKm: 102_000, engineHours: 1100 }, AHORA);
    expect(r.dimensiones).toHaveLength(3);
    expect(r.dimensiones.map((d) => d.dimension).sort()).toEqual(['date', 'hours', 'km']);
  });
});

describe('evaluarRegla · datos faltantes', () => {
  it('marca sinDatos si mide en km pero la unidad no reporta odómetro', () => {
    const porKm = regla({ intervalKm: 5000, baselineKm: 100_000 });
    const r = evaluarRegla(porKm, sinLecturas, AHORA);
    expect(r.sinDatos).toBe(true);
    expect(r.nivel).toBe('ok');
    expect(r.mensaje).toBe('sin datos suficientes todavía');
  });

  it('evalúa la fecha aunque falte el odómetro', () => {
    // Lo importante: que falte un dato no debe anular las demás dimensiones.
    const mixta = regla({
      intervalKm: 5000,
      baselineKm: 100_000,
      intervalDays: 180,
      baselineAt: new Date('2026-01-01T12:00:00Z'),
    });
    const r = evaluarRegla(mixta, sinLecturas, AHORA);
    expect(r.sinDatos).toBe(true);
    expect(r.dimension).toBe('date');
    expect(r.nivel).toBe('overdue');
  });

  it('no revienta cuando la regla no tiene ningún intervalo', () => {
    const r = evaluarRegla(regla(), sinLecturas, AHORA);
    expect(r.nivel).toBe('ok');
    expect(r.dimension).toBeNull();
    expect(r.dimensiones).toHaveLength(0);
  });
});

describe('compararUrgencia', () => {
  it('pone lo vencido antes que lo por vencer, y eso antes que lo que está bien', () => {
    const porKm = (km: number): ReturnType<typeof evaluarRegla> =>
      evaluarRegla(
        regla({ intervalKm: 5000, noticeKm: 500, baselineKm: 100_000 }),
        { odometerKm: km, engineHours: null },
        AHORA,
      );

    const orden = [porKm(101_000), porKm(106_000), porKm(104_800)]
      .sort(compararUrgencia)
      .map((e) => e.nivel);

    expect(orden).toEqual(['overdue', 'due_soon', 'ok']);
  });
});

describe('estimación por ritmo de uso', () => {
  const porKm = regla({ intervalKm: 5000, noticeKm: 500, baselineKm: 100_000 });

  it('traduce kilómetros faltantes a días con el ritmo de la unidad', () => {
    // Faltan 480 km a 80 km/día = 6 días.
    const r = evaluarRegla(
      porKm,
      { odometerKm: 104_520, engineHours: null, kmPorDia: 80 },
      AHORA,
    );
    expect(r.diasEstimados).toBe(6);
    expect(r.fechaEstimada).not.toBeNull();
  });

  it('no estima cuando la unidad casi no se mueve', () => {
    // Un vehículo parado nunca llega por kilometraje. Decir "faltan 99999
    // días" es peor que no decir nada.
    const r = evaluarRegla(
      porKm,
      { odometerKm: 104_520, engineHours: null, kmPorDia: 0 },
      AHORA,
    );
    expect(r.diasEstimados).toBeNull();
    expect(r.fechaEstimada).toBeNull();
  });

  it('no estima si no se conoce el ritmo', () => {
    const r = evaluarRegla(porKm, { odometerKm: 104_520, engineHours: null }, AHORA);
    expect(r.diasEstimados).toBeNull();
  });

  it('da días negativos cuando ya venció', () => {
    const r = evaluarRegla(
      porKm,
      { odometerKm: 105_400, engineHours: null, kmPorDia: 80 },
      AHORA,
    );
    expect(r.diasEstimados).toBeLessThan(0);
  });

  it('para una regla por fecha, los días ya son el dato', () => {
    const porFecha = regla({
      intervalDays: 180,
      baselineAt: new Date('2026-06-01T12:00:00Z'),
    });
    const r = evaluarRegla(porFecha, sinLecturas, AHORA);
    // 1 jun a 31 ago son 91 días; faltan 89 de los 180.
    expect(r.diasEstimados).toBe(89);
  });

  it('distingue dos unidades con los mismos km pero distinto ritmo', () => {
    // Es justo lo que un contador esconde: mismos kilómetros faltantes, pero
    // una está a una semana y la otra a más de un mes.
    const intensa = evaluarRegla(
      porKm,
      { odometerKm: 104_500, engineHours: null, kmPorDia: 100 },
      AHORA,
    );
    const ligera = evaluarRegla(
      porKm,
      { odometerKm: 104_500, engineHours: null, kmPorDia: 15 },
      AHORA,
    );
    expect(intensa.diasEstimados).toBe(5);
    expect(ligera.diasEstimados).toBe(33);
  });
});
