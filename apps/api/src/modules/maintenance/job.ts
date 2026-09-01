/**
 * Job programado que evalúa los mantenimientos pendientes.
 *
 * Corre cada MAINTENANCE_JOB_INTERVAL_MINUTES (60 por omisión), evalúa todas
 * las reglas activas y sincroniza la tabla de avisos.
 *
 * Se usa setInterval y no una biblioteca de cron: la única necesidad es "cada N
 * minutos", y una dependencia más para eso no se paga sola. Si algún día hiciera
 * falta "todos los martes a las 8", ahí sí tocaría cron.
 *
 * Las notificaciones push vienen en una fase posterior. Por ahora el job
 * escribe a `app.alerts` y al log, que es lo que necesita el frontend.
 */

import { config } from '../../config.ts';
import type { AppLogger } from '../../lib/logger.ts';
import type { TraccarClient } from '../../traccar/client.ts';
import { evaluarRegla } from './evaluate.ts';
import * as repo from './repo.ts';
import { leerFlota } from './routes.ts';

export class MaintenanceJob {
  private temporizador: NodeJS.Timeout | null = null;
  /** Evita que dos ejecuciones se encimen si una tarda más de lo esperado. */
  private corriendo = false;

  constructor(
    private readonly client: TraccarClient,
    private readonly logger: AppLogger,
  ) {}

  public start(): void {
    const minutos = config.MAINTENANCE_JOB_INTERVAL_MINUTES;

    // Una pasada al arrancar: si el servidor estuvo apagado un día, los avisos
    // deben estar al día en cuanto vuelve, no dentro de una hora.
    void this.ejecutar();

    this.temporizador = setInterval(
      () => {
        void this.ejecutar();
      },
      minutos * 60_000,
    );

    this.logger.info({ minutos }, 'Job de mantenimientos programado');
  }

  public stop(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /** Ejecuta una evaluación completa. Pública para poder dispararla a mano. */
  public async ejecutar(): Promise<{
    evaluadas: number;
    abiertos: number;
    cerrados: number;
    vencidos: number;
  }> {
    if (this.corriendo) {
      this.logger.warn('El job anterior sigue corriendo; se omite esta pasada');
      return { evaluadas: 0, abiertos: 0, cerrados: 0, vencidos: 0 };
    }
    this.corriendo = true;

    try {
      const reglas = await repo.listarReglas();
      if (reglas.length === 0) {
        this.logger.debug('No hay reglas de mantenimiento que evaluar');
        return { evaluadas: 0, abiertos: 0, cerrados: 0, vencidos: 0 };
      }

      const { lecturas } = await leerFlota(this.client);
      const ahora = new Date();

      let abiertos = 0;
      let cerrados = 0;
      let vencidos = 0;

      for (const regla of reglas) {
        const lectura = lecturas.get(regla.deviceId) ?? {
          odometerKm: null,
          engineHours: null,
        };
        const evaluacion = evaluarRegla(regla, lectura, ahora);

        const resultado = await repo.sincronizarAviso(evaluacion);
        if (resultado === 'abierto') abiertos += 1;
        if (resultado === 'cerrado') cerrados += 1;
        if (evaluacion.nivel === 'overdue') vencidos += 1;

        // Un aviso nuevo se registra en el log con nivel warn: es lo que
        // permite enterarse sin abrir el frontend.
        if (resultado === 'abierto' || resultado === 'actualizado') {
          this.logger.warn(
            {
              ruleId: evaluacion.ruleId,
              deviceId: evaluacion.deviceId,
              nivel: evaluacion.nivel,
              dimension: evaluacion.dimension,
            },
            `Mantenimiento · ${evaluacion.name}: ${evaluacion.mensaje}`,
          );
        }
      }

      const resumen = { evaluadas: reglas.length, abiertos, cerrados, vencidos };
      this.logger.info(resumen, 'Evaluación de mantenimientos terminada');
      return resumen;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      // Un fallo del job no debe tumbar el servidor: se registra y se reintenta
      // en la siguiente pasada.
      this.logger.error({ err: mensaje }, 'Falló la evaluación de mantenimientos');
      return { evaluadas: 0, abiertos: 0, cerrados: 0, vencidos: 0 };
    } finally {
      this.corriendo = false;
    }
  }
}
