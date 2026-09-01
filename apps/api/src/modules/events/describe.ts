/**
 * Traduce los eventos de Traccar a algo que se pueda leer.
 *
 * Traccar emite tipos como `deviceOverspeed` o `geofenceExit`. Mostrarlos tal
 * cual obliga a quien mira la pantalla a traducir mentalmente, y una
 * notificación emergente que dice "deviceOverspeed" no sirve de nada.
 *
 * Función pura: entra el evento crudo y el contexto, sale el texto.
 */

import { KNOTS_TO_KMH, type TraccarEvent } from '../../traccar/types.ts';

/**
 * Qué tanto interrumpe cada tipo de evento.
 *
 *   info    · queda en el historial, no interrumpe
 *   warning · aparece como aviso emergente
 *   alarm   · además dispara notificación del navegador
 *
 * La clasificación es una decisión de producto, no técnica: si todo fuera
 * `alarm`, en una semana nadie miraría las notificaciones.
 */
const SEVERIDAD: Readonly<Record<string, 'info' | 'warning' | 'alarm'>> = {
  deviceOnline: 'info',
  deviceOffline: 'warning',
  deviceInactive: 'warning',
  deviceMoving: 'info',
  deviceStopped: 'info',
  deviceOverspeed: 'warning',
  deviceFuelDrop: 'alarm',
  deviceFuelIncrease: 'info',
  geofenceEnter: 'info',
  geofenceExit: 'warning',
  alarm: 'alarm',
  ignitionOn: 'info',
  ignitionOff: 'info',
  maintenance: 'warning',
  commandResult: 'info',
  driverChanged: 'info',
  textMessage: 'info',
  media: 'info',
  queuedCommandSent: 'info',
};

const ETIQUETA: Readonly<Record<string, string>> = {
  deviceOnline: 'se conectó',
  deviceOffline: 'perdió conexión',
  deviceInactive: 'lleva tiempo sin reportar',
  deviceMoving: 'empezó a moverse',
  deviceStopped: 'se detuvo',
  deviceOverspeed: 'excedió el límite de velocidad',
  deviceFuelDrop: 'caída brusca de combustible',
  deviceFuelIncrease: 'carga de combustible',
  geofenceEnter: 'entró a la geocerca',
  geofenceExit: 'salió de la geocerca',
  ignitionOn: 'encendió el motor',
  ignitionOff: 'apagó el motor',
  maintenance: 'requiere mantenimiento',
  commandResult: 'respondió a un comando',
  driverChanged: 'cambió de conductor',
  textMessage: 'envió un mensaje',
  media: 'envió una foto o video',
  queuedCommandSent: 'recibió un comando en cola',
};

/**
 * Tipos de alarma que manda el equipo dentro de un evento `alarm`.
 *
 * Es donde llegan las alertas que de verdad importan: botón de pánico, corte
 * de energía, remolque del vehículo.
 */
const ALARMA: Readonly<Record<string, string>> = {
  sos: 'BOTÓN DE PÁNICO',
  vibration: 'vibración detectada',
  movement: 'movimiento no autorizado',
  overspeed: 'exceso de velocidad',
  powerCut: 'CORTE DE CORRIENTE',
  powerOff: 'equipo apagado',
  powerOn: 'equipo encendido',
  lowBattery: 'batería baja',
  lowPower: 'energía baja',
  tow: 'REMOLQUE DETECTADO',
  geofence: 'alarma de geocerca',
  geofenceEnter: 'entrada a zona',
  geofenceExit: 'salida de zona',
  accident: 'ACCIDENTE DETECTADO',
  tampering: 'MANIPULACIÓN DEL EQUIPO',
  removing: 'EQUIPO RETIRADO',
  hardAcceleration: 'aceleración brusca',
  hardBraking: 'frenado brusco',
  hardCornering: 'giro brusco',
  fatigueDriving: 'conducción prolongada',
  idle: 'motor en ralentí',
  jamming: 'INTERFERENCIA DE SEÑAL',
  fuelLeak: 'fuga de combustible',
  door: 'puerta abierta',
};

export interface ContextoEvento {
  readonly deviceName: string;
  readonly geofenceName?: string | undefined;
}

const cadena = (attrs: Readonly<Record<string, unknown>>, clave: string): string | null => {
  const v = attrs[clave];
  return typeof v === 'string' ? v : null;
};

const numero = (attrs: Readonly<Record<string, unknown>>, clave: string): number | null => {
  const v = attrs[clave];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Severidad del evento, subiendo a `alarm` según el tipo de alarma. */
export function severidadDe(evento: TraccarEvent): 'info' | 'warning' | 'alarm' {
  return SEVERIDAD[evento.type] ?? 'info';
}

/** Texto listo para mostrar. */
export function describirEvento(evento: TraccarEvent, contexto: ContextoEvento): string {
  const unidad = contexto.deviceName;

  if (evento.type === 'alarm') {
    const tipo = cadena(evento.attributes, 'alarm');
    const texto = tipo === null ? 'alarma' : (ALARMA[tipo] ?? `alarma: ${tipo}`);
    return `${unidad} · ${texto}`;
  }

  if (evento.type === 'deviceOverspeed') {
    // Traccar guarda la velocidad en NUDOS también aquí.
    const nudos = numero(evento.attributes, 'speed');
    const limite = numero(evento.attributes, 'speedLimit');
    const partes: string[] = [];
    if (nudos !== null) partes.push(`${String(Math.round(nudos * KNOTS_TO_KMH))} km/h`);
    if (limite !== null) partes.push(`límite ${String(Math.round(limite * KNOTS_TO_KMH))}`);
    const detalle = partes.length === 0 ? '' : ` (${partes.join(', ')})`;
    return `${unidad} · exceso de velocidad${detalle}`;
  }

  if (evento.type === 'geofenceEnter' || evento.type === 'geofenceExit') {
    const zona = contexto.geofenceName ?? 'una zona';
    const verbo = evento.type === 'geofenceEnter' ? 'entró a' : 'salió de';
    return `${unidad} · ${verbo} ${zona}`;
  }

  const etiqueta = ETIQUETA[evento.type] ?? evento.type;
  return `${unidad} · ${etiqueta}`;
}
