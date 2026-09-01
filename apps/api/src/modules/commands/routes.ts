/**
 * Comandos remotos hacia los rastreadores.
 *
 * Traccar los envía; aquí se traducen, se clasifican por riesgo y se aplica la
 * única salvaguarda que de verdad importa: no cortar el motor de un vehículo en
 * movimiento.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { TraccarClient } from '../../traccar/client.ts';
import { toUnitPosition } from '../../traccar/mapper.ts';
import {
  describirComando,
  EXIGEN_VEHICULO_DETENIDO,
  VELOCIDAD_DETENIDO_KMH,
} from './catalogo.ts';

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const enviarSchema = z.object({
  type: z.string().trim().min(1).max(60),
  /** Parámetros del comando: frecuencia, texto personalizado, etc. */
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** `true` manda por SMS en vez de por la conexión de datos. */
  textChannel: z.boolean().default(false),
  /**
   * Confirma explícitamente un comando peligroso con el vehículo en
   * movimiento. La interfaz nunca lo manda sola: exige que la persona lo
   * marque a mano.
   */
  confirmarEnMovimiento: z.boolean().default(false),
});

export function registerCommandRoutes(app: FastifyInstance, client: TraccarClient): void {
  /**
   * Comandos que soporta esta unidad.
   *
   * Traccar filtra por el protocolo real del equipo, así que la lista depende
   * de qué rastreador sea. Un equipo con protocolo OsmAnd (nuestro simulador,
   * o la app Traccar Client) solo acepta `custom`, porque ese protocolo no
   * define comandos: es una limitación del protocolo, no un error.
   */
  app.get('/api/units/:id/commands', async (request) => {
    const { id } = idSchema.parse(request.params);

    const [porDatos, porSms, posiciones] = await Promise.all([
      client.getCommandTypes(id, false),
      client.getCommandTypes(id, true),
      client.getLatestPositions(),
    ]);

    const posicion = posiciones.find((p) => p.deviceId === id);
    const velocidadKmh =
      posicion === undefined ? null : toUnitPosition(posicion).speedKmh;

    const mapear = (tipos: readonly { type: string }[]): unknown[] =>
      tipos.map((t) => ({ type: t.type, ...describirComando(t.type) }));

    return {
      unitId: id,
      /** Por la conexión de datos. Gratis, pero exige que el equipo esté en línea. */
      viaDatos: mapear(porDatos),
      /** Por SMS. Funciona aunque el equipo esté sin datos, pero cuesta un mensaje. */
      viaSms: mapear(porSms),
      velocidadKmh,
      enMovimiento: velocidadKmh !== null && velocidadKmh > VELOCIDAD_DETENIDO_KMH,
      /**
       * Cuando solo aparece `custom` por datos, casi siempre es un equipo con
       * protocolo OsmAnd. Se dice explícitamente para que no parezca un fallo.
       */
      soloCustom: porDatos.length <= 1 && porDatos.every((t) => t.type === 'custom'),
    };
  });

  /**
   * Envía un comando.
   *
   * LA SALVAGUARDA: cortar el motor de un vehículo en movimiento es un
   * accidente. Muchos equipos traen su propia protección, pero **no se puede
   * dar por hecho**: varios clones baratos ejecutan el corte a cualquier
   * velocidad.
   *
   * La comprobación está en el SERVIDOR y no solo en la interfaz. Una guarda
   * que vive únicamente en el frontend se salta con una petición directa, y
   * aquí lo que está en juego no es un dato mal guardado.
   */
  app.post('/api/units/:id/commands', async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    const datos = enviarSchema.parse(request.body);

    if (EXIGEN_VEHICULO_DETENIDO.includes(datos.type)) {
      const posiciones = await client.getLatestPositions();
      const posicion = posiciones.find((p) => p.deviceId === id);
      const velocidadKmh = posicion === undefined ? 0 : toUnitPosition(posicion).speedKmh;

      if (velocidadKmh > VELOCIDAD_DETENIDO_KMH && !datos.confirmarEnMovimiento) {
        request.log.warn(
          { deviceId: id, tipo: datos.type, velocidadKmh },
          'Comando peligroso bloqueado: el vehiculo esta en movimiento',
        );
        void reply.status(409);
        return {
          error: 'Vehículo en movimiento',
          message:
            `La unidad va a ${String(Math.round(velocidadKmh))} km/h. ` +
            'Cortar el motor en movimiento hace perder la dirección asistida y endurece ' +
            'los frenos. Espera a que se detenga.',
          velocidadKmh: Math.round(velocidadKmh),
          requiereConfirmacion: true,
        };
      }
    }

    await client.sendCommand({
      deviceId: id,
      type: datos.type,
      attributes: datos.attributes,
      textChannel: datos.textChannel,
    });

    // Todo comando queda en el log. Para un corte de motor, saber quién y
    // cuándo no es un lujo.
    request.log.info(
      {
        deviceId: id,
        tipo: datos.type,
        canal: datos.textChannel ? 'sms' : 'datos',
        forzado: datos.confirmarEnMovimiento,
      },
      'Comando enviado',
    );

    return {
      enviado: true,
      /**
       * Traccar acepta el comando y lo encola; que llegue al equipo depende de
       * que esté en línea. Decirlo evita que un "listo" se lea como "hecho".
       */
      nota: datos.textChannel
        ? 'Enviado por SMS. Puede tardar según la cobertura.'
        : 'Encolado. Se entregará cuando el equipo esté en línea.',
    };
  });
}
