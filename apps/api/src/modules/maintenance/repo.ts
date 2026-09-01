/**
 * Acceso a datos del módulo de mantenimientos.
 *
 * Todo vive en el esquema `app`. Las lecturas de kilómetros y horas de motor
 * salen de `tc_positions`, que se LEE y nunca se escribe.
 */

import { pool } from '../../db.ts';
import type { Evaluacion, Lecturas, ReglaEvaluable } from './evaluate.ts';

// ============================================================================
//  Tipos
// ============================================================================

export interface Plantilla {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly intervalEngineHours: number | null;
  readonly noticeKm: number | null;
  readonly noticeDays: number | null;
  readonly noticeEngineHours: number | null;
  /** Cuántas unidades tienen esta plantilla aplicada. */
  readonly appliedCount: number;
}

export interface Servicio {
  readonly id: number;
  readonly ruleId: number;
  readonly deviceId: number;
  readonly performedAt: string;
  readonly odometerKm: number | null;
  readonly engineHours: number | null;
  readonly cost: number | null;
  readonly vendor: string | null;
  readonly notes: string | null;
}

export interface ReglaConEvaluacion extends Evaluacion {
  readonly deviceName: string;
  readonly deviceCategory: string | null;
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly intervalEngineHours: number | null;
  readonly baselineKm: number | null;
  readonly baselineAt: string;
  readonly templateId: number | null;
  readonly lastServiceAt: string | null;
}

// `numeric` de PostgreSQL llega como string en node-pg, para no perder
// precisión. Aquí sí queremos number, y null cuando no hay valor.
const num = (v: string | number | null): number | null => {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

// ============================================================================
//  Plantillas
// ============================================================================

interface FilaPlantilla {
  id: number;
  name: string;
  description: string | null;
  interval_km: string | null;
  interval_days: number | null;
  interval_engine_hours: string | null;
  notice_km: string | null;
  notice_days: number | null;
  notice_engine_hours: string | null;
  applied_count: string;
}

export async function listarPlantillas(): Promise<Plantilla[]> {
  const { rows } = await pool.query<FilaPlantilla>(`
    SELECT t.*,
           (SELECT count(*) FROM app.maintenance_rules r
             WHERE r.template_id = t.id AND r.active) AS applied_count
      FROM app.maintenance_templates t
     ORDER BY t.name
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    intervalKm: num(r.interval_km),
    intervalDays: r.interval_days,
    intervalEngineHours: num(r.interval_engine_hours),
    noticeKm: num(r.notice_km),
    noticeDays: r.notice_days,
    noticeEngineHours: num(r.notice_engine_hours),
    appliedCount: Number(r.applied_count),
  }));
}

export interface DatosPlantilla {
  readonly name: string;
  readonly description?: string | undefined;
  readonly intervalKm?: number | undefined;
  readonly intervalDays?: number | undefined;
  readonly intervalEngineHours?: number | undefined;
  readonly noticeKm?: number | undefined;
  readonly noticeDays?: number | undefined;
  readonly noticeEngineHours?: number | undefined;
}

export async function crearPlantilla(datos: DatosPlantilla): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO app.maintenance_templates
       (name, description, interval_km, interval_days, interval_engine_hours,
        notice_km, notice_days, notice_engine_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      datos.name,
      datos.description ?? null,
      datos.intervalKm ?? null,
      datos.intervalDays ?? null,
      datos.intervalEngineHours ?? null,
      datos.noticeKm ?? null,
      datos.noticeDays ?? null,
      datos.noticeEngineHours ?? null,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('No se pudo crear la plantilla');
  return id;
}

export async function borrarPlantilla(id: number): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM app.maintenance_templates WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

// ============================================================================
//  Aplicación masiva
// ============================================================================

/**
 * Aplica una plantilla a varias unidades de una sola vez.
 *
 * La línea base de cada regla se toma de la lectura ACTUAL de esa unidad, no de
 * cero: si un vehículo lleva 120,000 km y le aplicas "aceite cada 5,000", el
 * próximo servicio toca a los 125,000, no aparece vencido desde el primer día.
 *
 * Es idempotente gracias al índice único (device_id, template_id): volver a
 * aplicarla no duplica reglas ni reinicia las que ya existen.
 */
export async function aplicarPlantilla(
  templateId: number,
  deviceIds: readonly number[],
  lecturasPorUnidad: ReadonlyMap<number, Lecturas>,
): Promise<{ creadas: number; yaExistian: number }> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: plantillas } = await cliente.query<FilaPlantilla>(
      'SELECT * FROM app.maintenance_templates WHERE id = $1',
      [templateId],
    );
    const plantilla = plantillas[0];
    if (plantilla === undefined) {
      throw new Error(`No existe la plantilla ${String(templateId)}`);
    }

    let creadas = 0;
    for (const deviceId of deviceIds) {
      const lecturas = lecturasPorUnidad.get(deviceId);
      const { rowCount } = await cliente.query(
        `INSERT INTO app.maintenance_rules
           (template_id, device_id, name,
            interval_km, interval_days, interval_engine_hours,
            notice_km, notice_days, notice_engine_hours,
            baseline_km, baseline_at, baseline_engine_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11)
         ON CONFLICT DO NOTHING`,
        [
          templateId,
          deviceId,
          plantilla.name,
          plantilla.interval_km,
          plantilla.interval_days,
          plantilla.interval_engine_hours,
          plantilla.notice_km,
          plantilla.notice_days,
          plantilla.notice_engine_hours,
          lecturas?.odometerKm ?? null,
          lecturas?.engineHours ?? null,
        ],
      );
      creadas += rowCount ?? 0;
    }

    await cliente.query('COMMIT');
    return { creadas, yaExistian: deviceIds.length - creadas };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// ============================================================================
//  Reglas
// ============================================================================

interface FilaRegla {
  id: number;
  template_id: number | null;
  device_id: number;
  name: string;
  interval_km: string | null;
  interval_days: number | null;
  interval_engine_hours: string | null;
  notice_km: string | null;
  notice_days: number | null;
  notice_engine_hours: string | null;
  baseline_km: string | null;
  baseline_at: string;
  baseline_engine_hours: string | null;
  last_service_at: string | null;
}

export interface ReglaCruda extends ReglaEvaluable {
  readonly templateId: number | null;
  readonly baselineAtIso: string;
  readonly lastServiceAt: string | null;
}

function aRegla(fila: FilaRegla): ReglaCruda {
  return {
    id: fila.id,
    deviceId: fila.device_id,
    name: fila.name,
    intervalKm: num(fila.interval_km),
    intervalDays: fila.interval_days,
    intervalEngineHours: num(fila.interval_engine_hours),
    noticeKm: num(fila.notice_km),
    noticeDays: fila.notice_days,
    noticeEngineHours: num(fila.notice_engine_hours),
    baselineKm: num(fila.baseline_km),
    baselineAt: new Date(fila.baseline_at),
    baselineEngineHours: num(fila.baseline_engine_hours),
    templateId: fila.template_id,
    baselineAtIso: fila.baseline_at,
    lastServiceAt: fila.last_service_at,
  };
}

const SELECT_REGLAS = `
  SELECT r.*,
         (SELECT max(h.performed_at) FROM app.maintenance_history h
           WHERE h.rule_id = r.id) AS last_service_at
    FROM app.maintenance_rules r
   WHERE r.active
`;

export async function listarReglas(deviceId?: number): Promise<ReglaCruda[]> {
  const { rows } =
    deviceId === undefined
      ? await pool.query<FilaRegla>(`${SELECT_REGLAS} ORDER BY r.device_id, r.name`)
      : await pool.query<FilaRegla>(`${SELECT_REGLAS} AND r.device_id = $1 ORDER BY r.name`, [
          deviceId,
        ]);
  return rows.map(aRegla);
}

export async function obtenerRegla(id: number): Promise<ReglaCruda | null> {
  const { rows } = await pool.query<FilaRegla>(
    `${SELECT_REGLAS} AND r.id = $1`,
    [id],
  );
  const fila = rows[0];
  return fila === undefined ? null : aRegla(fila);
}

export async function borrarRegla(id: number): Promise<boolean> {
  // Baja lógica, no física: borrar la regla se llevaría por delante su
  // historial de servicios, que es el dato que más cuesta reconstruir.
  const { rowCount } = await pool.query(
    'UPDATE app.maintenance_rules SET active = false, updated_at = now() WHERE id = $1 AND active',
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ============================================================================
//  Servicios realizados
// ============================================================================

export interface DatosServicio {
  readonly performedAt: string;
  readonly odometerKm?: number | undefined;
  readonly engineHours?: number | undefined;
  readonly cost?: number | undefined;
  readonly vendor?: string | undefined;
  readonly notes?: string | undefined;
}

/**
 * Registra un servicio y REINICIA la línea base de la regla.
 *
 * Ambas cosas van en la misma transacción: si se guardara el servicio pero no
 * se moviera la línea base, la unidad seguiría marcada como vencida para
 * siempre; y al revés, se perdería el registro de que el servicio se hizo.
 */
export async function registrarServicio(
  ruleId: number,
  datos: DatosServicio,
  lecturas: Lecturas,
): Promise<number> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: reglas } = await cliente.query<{ device_id: number }>(
      'SELECT device_id FROM app.maintenance_rules WHERE id = $1 AND active FOR UPDATE',
      [ruleId],
    );
    const regla = reglas[0];
    if (regla === undefined) throw new Error(`No existe la regla activa ${String(ruleId)}`);

    // Si quien registra el servicio no capturó el odómetro, se usa la lectura
    // actual de la unidad. Capturarlo a mano gana, porque el servicio pudo
    // haberse hecho hace días.
    const odometro = datos.odometerKm ?? lecturas.odometerKm;
    const horas = datos.engineHours ?? lecturas.engineHours;

    const { rows: creado } = await cliente.query<{ id: number }>(
      `INSERT INTO app.maintenance_history
         (rule_id, device_id, performed_at, odometer_km, engine_hours, cost, vendor, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        ruleId,
        regla.device_id,
        datos.performedAt,
        odometro,
        horas,
        datos.cost ?? null,
        datos.vendor ?? null,
        datos.notes ?? null,
      ],
    );

    await cliente.query(
      `UPDATE app.maintenance_rules
          SET baseline_km = $2,
              baseline_at = $3,
              baseline_engine_hours = $4,
              updated_at = now()
        WHERE id = $1`,
      [ruleId, odometro, datos.performedAt, horas],
    );

    // El servicio ya se hizo: el aviso abierto deja de tener sentido.
    await cliente.query(
      'UPDATE app.alerts SET closed_at = now() WHERE rule_id = $1 AND closed_at IS NULL',
      [ruleId],
    );

    await cliente.query('COMMIT');
    const id = creado[0]?.id;
    if (id === undefined) throw new Error('No se pudo registrar el servicio');
    return id;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

interface FilaServicio {
  id: number;
  rule_id: number;
  device_id: number;
  performed_at: string;
  odometer_km: string | null;
  engine_hours: string | null;
  cost: string | null;
  vendor: string | null;
  notes: string | null;
}

export async function listarServicios(filtro: {
  readonly ruleId?: number | undefined;
  readonly deviceId?: number | undefined;
}): Promise<Servicio[]> {
  const condiciones: string[] = [];
  const valores: number[] = [];
  if (filtro.ruleId !== undefined) {
    valores.push(filtro.ruleId);
    condiciones.push(`rule_id = $${String(valores.length)}`);
  }
  if (filtro.deviceId !== undefined) {
    valores.push(filtro.deviceId);
    condiciones.push(`device_id = $${String(valores.length)}`);
  }
  const where = condiciones.length === 0 ? '' : `WHERE ${condiciones.join(' AND ')}`;

  const { rows } = await pool.query<FilaServicio>(
    `SELECT * FROM app.maintenance_history ${where} ORDER BY performed_at DESC LIMIT 500`,
    valores,
  );

  return rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    deviceId: r.device_id,
    performedAt: r.performed_at,
    odometerKm: num(r.odometer_km),
    engineHours: num(r.engine_hours),
    cost: num(r.cost),
    vendor: r.vendor,
    notes: r.notes,
  }));
}

// ============================================================================
//  Avisos
// ============================================================================

export interface Aviso {
  readonly id: number;
  readonly ruleId: number;
  readonly deviceId: number;
  readonly level: 'due_soon' | 'overdue';
  readonly triggerKind: 'km' | 'date' | 'hours';
  readonly message: string;
  readonly openedAt: string;
}

interface FilaAviso {
  id: number;
  rule_id: number;
  device_id: number;
  level: 'due_soon' | 'overdue';
  trigger_kind: 'km' | 'date' | 'hours';
  message: string;
  opened_at: string;
}

export async function listarAvisosAbiertos(): Promise<Aviso[]> {
  const { rows } = await pool.query<FilaAviso>(
    `SELECT id, rule_id, device_id, level, trigger_kind, message, opened_at
       FROM app.alerts
      WHERE closed_at IS NULL
      ORDER BY CASE level WHEN 'overdue' THEN 0 ELSE 1 END, opened_at`,
  );
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.rule_id,
    deviceId: r.device_id,
    level: r.level,
    triggerKind: r.trigger_kind,
    message: r.message,
    openedAt: r.opened_at,
  }));
}

/**
 * Sincroniza el aviso de una regla con el resultado de su evaluación.
 *
 * Abre uno si hace falta, actualiza el existente si cambió, y lo cierra cuando
 * la regla vuelve a estar en orden (por ejemplo, tras registrar el servicio).
 * El índice único parcial sobre (rule_id) WHERE closed_at IS NULL es lo que
 * garantiza que no se acumule un aviso nuevo cada hora.
 */
export async function sincronizarAviso(evaluacion: Evaluacion): Promise<'abierto' | 'actualizado' | 'cerrado' | 'sin cambio'> {
  if (evaluacion.nivel === 'ok' || evaluacion.dimension === null) {
    const { rowCount } = await pool.query(
      'UPDATE app.alerts SET closed_at = now() WHERE rule_id = $1 AND closed_at IS NULL',
      [evaluacion.ruleId],
    );
    return (rowCount ?? 0) > 0 ? 'cerrado' : 'sin cambio';
  }

  const restantes = new Map(evaluacion.dimensiones.map((d) => [d.dimension, d.restante]));

  const { rows } = await pool.query<{ id: number; level: string }>(
    'SELECT id, level FROM app.alerts WHERE rule_id = $1 AND closed_at IS NULL',
    [evaluacion.ruleId],
  );
  const existente = rows[0];

  const valores = [
    evaluacion.ruleId,
    evaluacion.deviceId,
    evaluacion.nivel,
    evaluacion.dimension,
    restantes.get('km') ?? null,
    restantes.get('date') ?? null,
    restantes.get('hours') ?? null,
    `${evaluacion.name}: ${evaluacion.mensaje}`,
  ];

  if (existente === undefined) {
    await pool.query(
      `INSERT INTO app.alerts
         (rule_id, device_id, level, trigger_kind, remaining_km, remaining_days,
          remaining_hours, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      valores,
    );
    return 'abierto';
  }

  await pool.query(
    `UPDATE app.alerts
        SET level = $3, trigger_kind = $4, remaining_km = $5, remaining_days = $6,
            remaining_hours = $7, message = $8, updated_at = now()
      WHERE rule_id = $1 AND closed_at IS NULL`,
    valores,
  );
  return existente.level === evaluacion.nivel ? 'sin cambio' : 'actualizado';
}
