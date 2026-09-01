/**
 * Evaluación de reglas de mantenimiento.
 *
 * Funciones PURAS a propósito: no leen la base, no leen el reloj, no llaman a
 * Traccar. Todo entra por parámetros. Es la parte del proyecto donde un error
 * no lanza ninguna excepción — simplemente avisa tarde de un cambio de aceite,
 * o avisa de uno que no tocaba — así que tiene que ser fácil de probar.
 *
 * LA REGLA DE "LO QUE OCURRA PRIMERO"
 * -----------------------------------
 * Una regla puede tener hasta tres dimensiones a la vez: kilómetros, días y
 * horas de motor. "Aceite cada 5,000 km o cada 6 meses, lo que ocurra primero"
 * es el caso normal, no la excepción.
 *
 * Para compararlas entre sí se calcula el AVANCE de cada una (fracción del
 * intervalo ya consumida) y gana la más avanzada: esa es la que va a vencer
 * primero. El avance es adimensional, así que sí se pueden comparar kilómetros
 * contra días.
 */

/** Las tres dimensiones en las que se puede medir un mantenimiento. */
export type Dimension = 'km' | 'date' | 'hours';

export type NivelAviso = 'ok' | 'due_soon' | 'overdue';

export interface ReglaEvaluable {
  readonly id: number;
  readonly deviceId: number;
  readonly name: string;

  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly intervalEngineHours: number | null;

  readonly noticeKm: number | null;
  readonly noticeDays: number | null;
  readonly noticeEngineHours: number | null;

  readonly baselineKm: number | null;
  readonly baselineAt: Date;
  readonly baselineEngineHours: number | null;
}

/** Lecturas actuales de la unidad, tomadas de su última posición. */
export interface Lecturas {
  readonly odometerKm: number | null;
  readonly engineHours: number | null;
  /**
   * Kilómetros por día que hace esta unidad, promediados sobre las últimas
   * semanas. `null` si todavía no hay historial suficiente.
   *
   * Es lo que permite responder CUÁNDO va a vencer un servicio, no solo cuánto
   * falta. "Faltan 480 km" no dice nada a quien tiene que agendar el taller;
   * "faltan 480 km, unos 6 días a su ritmo" sí.
   */
  readonly kmPorDia?: number | null;
  /** Horas de motor por día, mismo criterio. */
  readonly horasPorDia?: number | null;
}

/** Estado de una de las tres dimensiones. */
export interface EstadoDimension {
  readonly dimension: Dimension;
  /** Lo que falta. Negativo = ya se pasó. */
  readonly restante: number;
  /** Fracción del intervalo consumida. 1 = justo en el punto. */
  readonly avance: number;
  readonly nivel: NivelAviso;
}

export interface Evaluacion {
  readonly ruleId: number;
  readonly deviceId: number;
  readonly name: string;
  readonly nivel: NivelAviso;
  /** La dimensión que vence primero. `null` si no se pudo evaluar ninguna. */
  readonly dimension: Dimension | null;
  readonly avance: number;
  readonly dimensiones: readonly EstadoDimension[];
  /** Texto listo para mostrar: "faltan 480 km", "vencido hace 12 días". */
  readonly mensaje: string;
  /**
   * `true` cuando la regla mide en kilómetros u horas pero la unidad todavía
   * no reporta ese dato. No es un error: es una unidad recién dada de alta, o
   * un equipo que no informa horas de motor.
   */
  readonly sinDatos: boolean;
  /**
   * Días que faltan al ritmo actual de uso. Negativo si ya venció.
   * `null` cuando no hay ritmo conocido o la dimensión crítica es la fecha
   * (ahí el dato ya es la fecha misma).
   */
  readonly diasEstimados: number | null;
  /** Fecha estimada del vencimiento, en ISO. */
  readonly fechaEstimada: string | null;
}

const MS_POR_DIA = 86_400_000;

/**
 * Evalúa una sola dimensión.
 *
 * @param consumido Cuánto se lleva recorrido/transcurrido desde la línea base.
 * @param intervalo Cada cuánto toca el servicio.
 * @param aviso     Cuánto antes avisar. `null` = 10 % del intervalo.
 */
function evaluarDimension(
  dimension: Dimension,
  consumido: number,
  intervalo: number,
  aviso: number | null,
): EstadoDimension {
  const restante = intervalo - consumido;
  const avance = consumido / intervalo;

  // Sin aviso previo configurado se usa el 10 % del intervalo. Un valor fijo
  // (por ejemplo "500 km") no sirve para las tres dimensiones a la vez, y
  // avisar solo al vencer no deja tiempo de agendar el servicio.
  const margen = aviso ?? intervalo * 0.1;

  let nivel: NivelAviso;
  if (restante <= 0) {
    nivel = 'overdue';
  } else if (restante <= margen) {
    nivel = 'due_soon';
  } else {
    nivel = 'ok';
  }

  return { dimension, restante, avance, nivel };
}

const UNIDAD: Readonly<Record<Dimension, string>> = {
  km: 'km',
  date: 'días',
  hours: 'horas de motor',
};

/**
 * Formatea una magnitud para mostrarla, según su dimensión.
 *
 * Los DÍAS son siempre enteros: "faltan 3.0 días" se lee mal, y medio día no
 * es una unidad con la que nadie agende un servicio. Por debajo de uno se dice
 * "menos de 1".
 *
 * Los KILÓMETROS y las HORAS sí admiten decimal cuando la cifra es pequeña:
 * redondear a entero a secas produce "faltan 0 km", que no informa nada.
 */
function formatear(dimension: Dimension, magnitud: number): string {
  if (dimension === 'date') {
    return magnitud < 1 ? 'menos de 1' : Math.round(magnitud).toLocaleString('es-MX');
  }
  if (magnitud < 0.1) return 'menos de 0.1';
  if (magnitud < 10) return magnitud.toFixed(1);
  return Math.round(magnitud).toLocaleString('es-MX');
}

/** Texto para la dimensión que vence primero. */
function describir(estado: EstadoDimension): string {
  const { dimension, restante, nivel } = estado;
  const magnitud = Math.abs(restante);
  const cifra = formatear(dimension, magnitud);

  // "menos de 1 días" está mal escrito. Los días son la única unidad de las
  // tres que cambia de forma en singular.
  const unidad = dimension === 'date' && magnitud < 2 ? 'día' : UNIDAD[dimension];

  return nivel === 'overdue'
    ? `vencido hace ${cifra} ${unidad}`
    : `faltan ${cifra} ${unidad}`;
}

/**
 * Traduce lo que falta a DÍAS, usando el ritmo real de uso de la unidad.
 *
 * Es la diferencia entre un contador y una herramienta de planificación.
 * "Faltan 480 km" no le sirve a quien tiene que agendar el taller; "faltan 480
 * km, unos 6 días a su ritmo" sí. Y hace visible algo que un contador esconde:
 * dos unidades a las que les faltan los mismos kilómetros pueden estar a una
 * semana o a dos meses de distancia según cuánto trabajen.
 *
 * Devuelve `null` cuando no se puede estimar, en vez de inventar un número.
 */
function estimarDias(estado: EstadoDimension, lecturas: Lecturas): number | null {
  switch (estado.dimension) {
    case 'date':
      // La dimensión ya está en días; no hay nada que estimar.
      return estado.restante;
    case 'km': {
      const ritmo = lecturas.kmPorDia;
      // Un ritmo de cero o casi cero daría una división que tiende a infinito:
      // un vehículo parado nunca llega por kilometraje, y decir "faltan 99999
      // días" es peor que no decir nada.
      if (ritmo == null || ritmo < 0.5) return null;
      return estado.restante / ritmo;
    }
    case 'hours': {
      const ritmo = lecturas.horasPorDia;
      if (ritmo == null || ritmo < 0.01) return null;
      return estado.restante / ritmo;
    }
  }
}

/**
 * Evalúa una regla completa aplicando "lo que ocurra primero".
 *
 * @param ahora Se recibe como parámetro en vez de leer el reloj adentro, para
 *              que la función sea determinista y se pueda probar.
 */
export function evaluarRegla(
  regla: ReglaEvaluable,
  lecturas: Lecturas,
  ahora: Date,
): Evaluacion {
  const dimensiones: EstadoDimension[] = [];
  let sinDatos = false;

  // --- Kilómetros ---
  if (regla.intervalKm !== null) {
    if (lecturas.odometerKm === null || regla.baselineKm === null) {
      // La unidad no reporta odómetro todavía, o la regla nunca tuvo línea
      // base. No se puede evaluar esta dimensión, pero las otras sí.
      sinDatos = true;
    } else {
      dimensiones.push(
        evaluarDimension(
          'km',
          lecturas.odometerKm - regla.baselineKm,
          regla.intervalKm,
          regla.noticeKm,
        ),
      );
    }
  }

  // --- Fecha ---
  if (regla.intervalDays !== null) {
    const diasTranscurridos = (ahora.getTime() - regla.baselineAt.getTime()) / MS_POR_DIA;
    dimensiones.push(
      evaluarDimension('date', diasTranscurridos, regla.intervalDays, regla.noticeDays),
    );
  }

  // --- Horas de motor ---
  if (regla.intervalEngineHours !== null) {
    if (lecturas.engineHours === null || regla.baselineEngineHours === null) {
      sinDatos = true;
    } else {
      dimensiones.push(
        evaluarDimension(
          'hours',
          lecturas.engineHours - regla.baselineEngineHours,
          regla.intervalEngineHours,
          regla.noticeEngineHours,
        ),
      );
    }
  }

  if (dimensiones.length === 0) {
    return {
      ruleId: regla.id,
      deviceId: regla.deviceId,
      name: regla.name,
      nivel: 'ok',
      dimension: null,
      avance: 0,
      dimensiones: [],
      mensaje: sinDatos ? 'sin datos suficientes todavía' : 'sin intervalos configurados',
      sinDatos,
      diasEstimados: null,
      fechaEstimada: null,
    };
  }

  // "Lo que ocurra primero": gana la dimensión con MÁS avance, porque es la
  // que va a llegar antes al punto de servicio.
  let critica = dimensiones[0] as EstadoDimension;
  for (const estado of dimensiones) {
    if (estado.avance > critica.avance) critica = estado;
  }

  const diasEstimados = estimarDias(critica, lecturas);

  return {
    ruleId: regla.id,
    deviceId: regla.deviceId,
    name: regla.name,
    nivel: critica.nivel,
    dimension: critica.dimension,
    // Se limita a 1 para que una barra de progreso no se desborde cuando algo
    // lleva vencido mucho tiempo. El mensaje sí dice cuánto se pasó.
    avance: Math.min(critica.avance, 1),
    dimensiones,
    mensaje: describir(critica),
    sinDatos,
    diasEstimados: diasEstimados === null ? null : Math.round(diasEstimados),
    fechaEstimada:
      diasEstimados === null
        ? null
        : new Date(ahora.getTime() + diasEstimados * MS_POR_DIA).toISOString(),
  };
}

/** Orden para la vista de flota: primero lo más urgente. */
export function compararUrgencia(a: Evaluacion, b: Evaluacion): number {
  const peso: Record<NivelAviso, number> = { overdue: 0, due_soon: 1, ok: 2 };
  return peso[a.nivel] - peso[b.nivel] || b.avance - a.avance;
}
