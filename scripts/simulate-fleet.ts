/**
 * Simulador de flota.
 *
 * Inyecta posiciones de N vehiculos al puerto OsmAnd de Traccar (5055) por HTTP.
 * Cada unidad recorre un circuito real de una ciudad mexicana con velocidad
 * variable, paradas y arranques.
 *
 * Sin esto no se puede disenar nada: un mapa vacio no se puede maquetar, y una
 * lista de un solo vehiculo no deja ver los problemas reales de una flota.
 *
 * Uso:
 *   pnpm simulate
 *   pnpm simulate --units 10 --city cdmx --interval 5
 *   pnpm simulate --units 25 --city monterrey --speed-factor 4
 *
 * El simulador da de alta sus propias unidades en Traccar por la API REST antes
 * de empezar a enviar posiciones.
 *
 * ¿Por que no se dan de alta solas? Traccar rechaza con "Unknown device" y HTTP
 * 400 cualquier identificador que no conozca. Existe una opcion para desactivar
 * eso (database.registerUnknown), pero dejarla encendida significa que
 * cualquiera que alcance el puerto puede crear unidades en tu servidor. Se
 * prefiere registrarlas explicitamente, que ademas es lo que haras con los
 * rastreadores reales.
 */

import {
  CITIES,
  CITY_NAMES,
  VEHICLES,
  type City,
  type CityName,
  type Coord,
  type VehicleCategory,
} from './routes.ts';

// ============================================================================
//  Argumentos de linea de comandos
// ============================================================================

interface Options {
  readonly units: number;
  readonly city: CityName;
  /** Segundos entre reportes de cada unidad. */
  readonly interval: number;
  /** Multiplicador de velocidad. 1 = tiempo real. 4 = cuatro veces mas rapido. */
  readonly speedFactor: number;
  /** URL base del puerto OsmAnd de Traccar. */
  readonly server: string;
}

function parseArgs(argv: readonly string[]): Options {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    return argv[i + 1];
  };

  const num = (name: string, fallback: number, min: number, max: number): number => {
    const raw = get(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`--${name} debe ser un numero entre ${min} y ${max}, se recibio "${raw}"`);
    }
    return parsed;
  };

  const cityRaw = get('city') ?? 'cdmx';
  if (!CITY_NAMES.includes(cityRaw as CityName)) {
    throw new Error(`--city debe ser uno de: ${CITY_NAMES.join(', ')}. Se recibio "${cityRaw}"`);
  }

  return {
    units: num('units', 10, 1, 200),
    city: cityRaw as CityName,
    interval: num('interval', 5, 1, 300),
    speedFactor: num('speed-factor', 1, 0.1, 20),
    server: get('server') ?? `http://127.0.0.1:${process.env['PORT_OSMAND'] ?? '5055'}`,
  };
}

// ============================================================================
//  Geometria
// ============================================================================

const EARTH_RADIUS_M = 6_371_000;
const KMH_PER_KNOT = 1.852;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Distancia en metros entre dos coordenadas (formula del haversine). */
function distanceMeters(a: Coord, b: Coord): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Rumbo inicial en grados (0 = norte) para ir de `a` hacia `b`. */
function bearingDegrees(a: Coord, b: Coord): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto intermedio entre `a` y `b` con `t` entre 0 y 1. */
function interpolate(a: Coord, b: Coord, t: number): Coord {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ============================================================================
//  Una unidad simulada
// ============================================================================

/**
 * Perfil de conduccion. Alterna entre moverse y estar detenido, para que la
 * flota no se vea como diez puntos girando en circulos a velocidad constante.
 */
type DrivingState = 'moving' | 'stopped';

class SimulatedUnit {
  /** Identificador que Traccar usa como uniqueId. */
  public readonly deviceId: string;
  public readonly name: string;
  public readonly category: VehicleCategory;

  private readonly loop: readonly Coord[];
  /** Indice del segmento actual del circuito. */
  private segment: number;
  /** Avance dentro del segmento actual, de 0 a 1. */
  private progress: number;

  private state: DrivingState = 'moving';
  /** Segundos que faltan para cambiar de estado. */
  private stateTimer: number;

  /** Velocidad objetivo en km/h. */
  private targetSpeedKmh: number;
  /** Velocidad actual en km/h, que se acerca gradualmente a la objetivo. */
  private speedKmh = 0;

  private readonly odometerStartM: number;
  private odometerM = 0;

  constructor(index: number, loop: readonly Coord[]) {
    this.deviceId = `SIM${String(index + 1).padStart(3, '0')}`;
    const perfil = VEHICLES[index % VEHICLES.length];
    this.name = perfil?.name ?? `Unidad ${index + 1}`;
    // El tipo determina el icono de la unidad en el mapa.
    this.category = perfil?.category ?? 'truck';
    this.loop = loop;

    // Cada unidad arranca en un punto distinto del circuito, para que no salgan
    // todas encimadas en el mismo lugar.
    this.segment = Math.floor(Math.random() * loop.length);
    this.progress = Math.random();

    this.targetSpeedKmh = 30 + Math.random() * 30;
    this.stateTimer = 60 + Math.random() * 240;

    // Odometro inicial distinto por unidad, para que los mantenimientos por
    // kilometraje tengan algo interesante que mostrar desde el primer minuto.
    this.odometerStartM = Math.floor(Math.random() * 120_000) * 1000;
  }

  /** Avanza la simulacion `dt` segundos y devuelve la posicion resultante. */
  public advance(dt: number): {
    coord: Coord;
    speedKmh: number;
    bearing: number;
    odometerKm: number;
  } {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.state === 'moving') {
        // Se detiene: semaforo, entrega, trafico.
        this.state = 'stopped';
        this.stateTimer = 20 + Math.random() * 100;
      } else {
        this.state = 'moving';
        this.stateTimer = 90 + Math.random() * 300;
        this.targetSpeedKmh = 25 + Math.random() * 45;
      }
    }

    // Aceleracion y frenado graduales: un salto instantaneo de 0 a 60 km/h
    // produce rumbos y velocidades que ningun vehiculo real reporta.
    const goal = this.state === 'moving' ? this.targetSpeedKmh : 0;
    const maxDelta = (this.state === 'moving' ? 8 : 14) * dt; // km/h por segundo
    this.speedKmh += Math.sign(goal - this.speedKmh) * Math.min(maxDelta, Math.abs(goal - this.speedKmh));
    if (this.speedKmh < 0.5) this.speedKmh = 0;

    // Avanzar a lo largo del circuito la distancia recorrida en este intervalo.
    let remaining = (this.speedKmh / 3.6) * dt; // metros
    this.odometerM += remaining;

    while (remaining > 0) {
      const from = this.loop[this.segment % this.loop.length];
      const to = this.loop[(this.segment + 1) % this.loop.length];
      if (from === undefined || to === undefined) break;

      const segmentLength = distanceMeters(from, to);
      if (segmentLength === 0) {
        this.segment = (this.segment + 1) % this.loop.length;
        this.progress = 0;
        continue;
      }

      const remainingInSegment = segmentLength * (1 - this.progress);
      if (remaining < remainingInSegment) {
        this.progress += remaining / segmentLength;
        remaining = 0;
      } else {
        remaining -= remainingInSegment;
        this.segment = (this.segment + 1) % this.loop.length;
        this.progress = 0;
      }
    }

    const from = this.loop[this.segment % this.loop.length] ?? this.loop[0];
    const to = this.loop[(this.segment + 1) % this.loop.length] ?? this.loop[0];
    if (from === undefined || to === undefined) {
      throw new Error('El circuito de la ruta esta vacio');
    }

    const coord = interpolate(from, to, this.progress);

    // Un poco de ruido, como el de un GPS real. 0.00002 grados = ~2 metros.
    const jitter = (): number => (Math.random() - 0.5) * 0.00004;
    const noisy: Coord = [coord[0] + jitter(), coord[1] + jitter()];

    return {
      coord: noisy,
      speedKmh: this.speedKmh,
      bearing: bearingDegrees(from, to),
      odometerKm: (this.odometerStartM + this.odometerM) / 1000,
    };
  }
}

// ============================================================================
//  Envio a Traccar
// ============================================================================

/**
 * Manda una posicion al puerto OsmAnd.
 *
 * OJO CON LAS UNIDADES: el parametro `speed` del protocolo OsmAnd se
 * interpreta en NUDOS, no en km/h. Traccar guarda todas las velocidades en
 * nudos internamente. Ver OsmAndProtocolDecoder.java:152 aguas arriba.
 * La conversion es km/h / 1.852 = nudos.
 */
async function sendPosition(
  server: string,
  unit: SimulatedUnit,
  sample: ReturnType<SimulatedUnit['advance']>,
): Promise<void> {
  const params = new URLSearchParams({
    id: unit.deviceId,
    lat: sample.coord[1].toFixed(6),
    lon: sample.coord[0].toFixed(6),
    timestamp: Math.floor(Date.now() / 1000).toString(),
    speed: (sample.speedKmh / KMH_PER_KNOT).toFixed(2),
    bearing: sample.bearing.toFixed(1),
    altitude: (2200 + Math.random() * 40).toFixed(0),
    accuracy: (3 + Math.random() * 7).toFixed(1),
    batt: (70 + Math.random() * 30).toFixed(0),
    ignition: sample.speedKmh > 0 ? 'true' : 'false',
  });

  const response = await fetch(`${server}/?${params.toString()}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
}

// ============================================================================
//  Alta de unidades en Traccar
// ============================================================================

interface TraccarDevice {
  readonly id: number;
  readonly uniqueId: string;
  readonly name: string;
}

/**
 * Da de alta en Traccar las unidades que aun no existan.
 *
 * Es idempotente: si vuelves a correr el simulador, reconoce las que ya creo y
 * solo agrega las que falten. No toca las que tu hayas creado a mano.
 */
async function ensureDevices(
  traccarUrl: string,
  token: string,
  units: readonly SimulatedUnit[],
): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };

  const listResponse = await fetch(`${traccarUrl}/api/devices`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!listResponse.ok) {
    throw new Error(
      `No se pudo listar las unidades de Traccar: HTTP ${listResponse.status}. ` +
        'Revisa TRACCAR_API_TOKEN en tu .env.',
    );
  }

  const existing = (await listResponse.json()) as readonly TraccarDevice[];
  const known = new Set(existing.map((d) => d.uniqueId));

  // Solo se crean las que faltan. Las que ya existen NO se tocan: si el usuario
  // renombro una unidad o le cambio el icono desde el mapa, volver a correr el
  // simulador no debe deshacer ese cambio.
  const missing = units.filter((u) => !known.has(u.deviceId));
  if (missing.length === 0) {
    console.log(`  Las ${units.length} unidades ya existen en Traccar.`);
    console.log('  (no se modifican: se respetan los nombres e iconos que hayas puesto)');
    return;
  }

  console.log(`  Dando de alta ${missing.length} unidad(es) en Traccar...`);
  for (const unit of missing) {
    const response = await fetch(`${traccarUrl}/api/devices`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: unit.name,
        uniqueId: unit.deviceId,
        category: unit.category,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`No se pudo crear la unidad ${unit.deviceId}: HTTP ${response.status}`);
    }
    console.log(`    + ${unit.deviceId}  ${unit.name}`);
  }
}

// ============================================================================
//  Programa principal
// ============================================================================

/**
 * Carga el .env de la raiz del proyecto. Node lo soporta de forma nativa desde
 * la version 22, asi que no hace falta la dependencia dotenv.
 */
function loadEnv(): void {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch {
    // Sin .env se sigue adelante: puede que las variables vengan del entorno.
  }
}

async function main(): Promise<void> {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const city: City = CITIES[options.city];

  const units: SimulatedUnit[] = [];
  for (let i = 0; i < options.units; i += 1) {
    const loop = city.loops[i % city.loops.length];
    if (loop === undefined) throw new Error(`La ciudad ${city.label} no tiene circuitos`);
    units.push(new SimulatedUnit(i, loop));
  }

  console.log('');
  console.log(`  Simulador de flota  ·  ${city.label}`);
  console.log(`  ${'-'.repeat(52)}`);
  console.log(`  Unidades:        ${options.units}`);
  console.log(`  Servidor:        ${options.server}  (protocolo OsmAnd)`);
  console.log(`  Intervalo:       cada ${options.interval} s`);
  console.log(`  Factor de tiempo: ${options.speedFactor}x`);
  console.log(`  ${'-'.repeat(52)}`);
  console.log('');

  // Alta de las unidades. Traccar rechaza con HTTP 400 cualquier identificador
  // que no conozca, asi que esto tiene que pasar ANTES de enviar posiciones.
  const traccarUrl = process.env['TRACCAR_URL'] ?? 'http://127.0.0.1:8082';
  const token = process.env['TRACCAR_API_TOKEN'];
  if (token === undefined || token === '' || token.startsWith('pega-aqui')) {
    console.error('  ERROR: falta TRACCAR_API_TOKEN en tu archivo .env');
    console.error('');
    console.error('  Generalo en http://localhost:8082 -> Cuenta -> Token,');
    console.error('  o sigue docs/01-instalacion-local.md seccion 4.');
    console.error('');
    process.exitCode = 1;
    return;
  }

  try {
    await ensureDevices(traccarUrl, token, units);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ERROR: ${message}`);
    console.error('');
    console.error('  Revisa que los contenedores esten arriba:  pnpm infra:ps');
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('  Ctrl+C para detener.');
  console.log('');

  // Comprobacion temprana del puerto de protocolo: es mucho mejor decirlo ahora
  // que dejar al usuario mirando un mapa vacio preguntandose por que.
  const first = units[0];
  if (first !== undefined) {
    try {
      await sendPosition(options.server, first, first.advance(0));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR: no se pudo alcanzar ${options.server}`);
      console.error(`         ${message}`);
      console.error('');
      console.error('  El puerto OsmAnd (5055) no esta respondiendo.');
      console.error('  Revisa:  pnpm infra:ps');
      console.error('');
      process.exitCode = 1;
      return;
    }
  }

  let tick = 0;
  let sent = 0;
  let failed = 0;

  const dt = options.interval * options.speedFactor;

  const timer = setInterval(() => {
    tick += 1;
    const batch = units.map(async (unit) => {
      const sample = unit.advance(dt);
      try {
        await sendPosition(options.server, unit, sample);
        sent += 1;
      } catch {
        failed += 1;
      }
      return { unit, sample };
    });

    void Promise.all(batch).then((results) => {
      const moving = results.filter((r) => r.sample.speedKmh > 1).length;
      const avgSpeed =
        results.reduce((acc, r) => acc + r.sample.speedKmh, 0) / (results.length || 1);

      const line =
        `  [${new Date().toLocaleTimeString('es-MX')}] ` +
        `tick ${String(tick).padStart(4)}  ·  ` +
        `${String(moving).padStart(3)}/${units.length} en movimiento  ·  ` +
        `${avgSpeed.toFixed(0).padStart(3)} km/h promedio  ·  ` +
        `${sent} enviadas` +
        (failed > 0 ? `  ·  ${failed} fallidas` : '');
      console.log(line);
    });
  }, options.interval * 1000);

  const stop = (): void => {
    clearInterval(timer);
    console.log('');
    console.log(`  Detenido. ${sent} posiciones enviadas, ${failed} fallidas.`);
    console.log('');
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  ERROR: ${message}\n`);
  process.exitCode = 1;
});
