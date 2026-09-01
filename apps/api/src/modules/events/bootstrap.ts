/**
 * Asegura que Traccar empuje los eventos por el WebSocket.
 *
 * EL PROBLEMA QUE ESTO RESUELVE
 * ----------------------------
 * Traccar genera los eventos siempre: entradas y salidas de geocerca, exceso
 * de velocidad, alarmas del equipo. Se pueden consultar por REST sin
 * configurar nada.
 *
 * Pero al WebSocket **no llegan solos**. Quien los empuja es `NotificatorWeb`,
 * que es un *notificador*, y un notificador solo actúa cuando existe una
 * `Notification` configurada para ese tipo de evento con el canal `web`.
 *
 * Sin esa configuración el sistema parece roto de la peor manera: las
 * geocercas se dibujan, los eventos se guardan y se pueden consultar, y aun
 * así no llega ni un aviso a la pantalla.
 *
 * ⚠️ `allEvents` NO ES COMODÍN AQUÍ
 * --------------------------------
 * Es comodín en los REPORTES (`/api/reports/events?type=allEvents`), y por eso
 * es fácil suponer que también lo es en las notificaciones. No lo es. En
 * `NotificationManager.java` el filtro es:
 *
 *     .filter(notification -> notification.getType().equals(event.getType()))
 *
 * Comparación exacta. Una notificación de tipo `allEvents` no coincide nunca
 * con ningún evento real, así que no dispara nada — y no produce ningún error
 * que lo delate.
 *
 * Por eso hay que crear UNA notificación POR CADA tipo de evento.
 */

import { z } from 'zod';

import type { AppLogger } from '../../lib/logger.ts';
import type { TraccarClient } from '../../traccar/client.ts';

const CANAL_WEB = 'web';

/**
 * Tipos de evento que se quieren en vivo.
 *
 * No están todos los 23 que reconoce Traccar a propósito. Se omiten los que no
 * aportan a una flota de reparto (`proximityEnter/Exit` requieren configurar
 * proximidad, `media` es para cámaras) y los puramente técnicos
 * (`queuedCommandSent`). Agregar uno es añadir su cadena aquí.
 */
export const TIPOS_EN_VIVO: readonly string[] = [
  'deviceOnline',
  'deviceOffline',
  'deviceInactive',
  'deviceMoving',
  'deviceStopped',
  'deviceOverspeed',
  'deviceFuelDrop',
  'deviceFuelIncrease',
  'geofenceEnter',
  'geofenceExit',
  'alarm',
  'ignitionOn',
  'ignitionOff',
  'maintenance',
  'driverChanged',
  'commandResult',
];

export const notificationSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  always: z.boolean().optional(),
  notificators: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export async function asegurarNotificacionWeb(
  client: TraccarClient,
  logger: AppLogger,
): Promise<void> {
  let existentes;
  try {
    existentes = await client.getNotifications();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.warn(
      { err: mensaje },
      'No se pudo revisar las notificaciones de Traccar; los eventos en vivo podrían no llegar',
    );
    return;
  }

  const yaCubiertos = new Set(
    existentes
      .filter((n) => (n.notificators ?? '').split(',').includes(CANAL_WEB) && n.always === true)
      .map((n) => n.type),
  );

  const faltantes = TIPOS_EN_VIVO.filter((t) => !yaCubiertos.has(t));

  if (faltantes.length === 0) {
    logger.debug('Traccar ya empuja todos los eventos configurados por WebSocket');
    return;
  }

  let creadas = 0;
  for (const tipo of faltantes) {
    try {
      await client.createNotification({
        type: tipo,
        // `always: true` la aplica a TODAS las unidades. Sin esto habría que
        // vincular la notificación a cada unidad por separado, y una unidad
        // nueva quedaría sin avisos hasta que alguien se acordara.
        always: true,
        notificators: CANAL_WEB,
        description: `${tipo} en vivo (creada automáticamente)`,
        // Para el tipo `alarm`, Traccar exige el atributo `alarms` con la lista
        // de alarmas que interesan; si falta, el filtro devuelve `false` y NO
        // dispara ninguna. Está en NotificationManager.java.
        ...(tipo === 'alarm'
          ? {
              attributes: {
                alarms: [
                  'sos',
                  'powerCut',
                  'powerOff',
                  'tow',
                  'movement',
                  'vibration',
                  'accident',
                  'tampering',
                  'removing',
                  'jamming',
                  'lowBattery',
                  'overspeed',
                  'hardBraking',
                  'hardAcceleration',
                  'fuelLeak',
                  'door',
                ].join(','),
              },
            }
          : {}),
      });
      creadas += 1;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      logger.warn({ tipo, err: mensaje }, 'No se pudo crear la notificación de este tipo');
    }
  }

  if (creadas > 0) {
    logger.info(
      { creadas, total: TIPOS_EN_VIVO.length },
      'Notificaciones web creadas en Traccar: los eventos ya se empujan por WebSocket',
    );
  }
}
