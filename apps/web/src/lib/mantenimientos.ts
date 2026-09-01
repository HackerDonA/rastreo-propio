/**
 * Tipos y cliente HTTP del módulo de mantenimientos.
 */

const API_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000';

export type Dimension = 'km' | 'date' | 'hours';
export type NivelAviso = 'ok' | 'due_soon' | 'overdue';

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
  readonly appliedCount: number;
}

export interface EstadoDimension {
  readonly dimension: Dimension;
  readonly restante: number;
  readonly avance: number;
  readonly nivel: NivelAviso;
}

export interface ReglaEvaluada {
  readonly ruleId: number;
  readonly deviceId: number;
  readonly deviceName: string;
  readonly deviceCategory: string | null;
  readonly name: string;
  readonly nivel: NivelAviso;
  readonly dimension: Dimension | null;
  readonly avance: number;
  readonly dimensiones: readonly EstadoDimension[];
  readonly mensaje: string;
  readonly sinDatos: boolean;
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly intervalEngineHours: number | null;
  readonly baselineKm: number | null;
  readonly baselineAt: string;
  readonly templateId: number | null;
  readonly lastServiceAt: string | null;
  /**
   * Dias que faltan al ritmo REAL de uso de esa unidad. Negativo si ya vencio,
   * `null` si no se puede estimar (unidad parada, o sin historial suficiente).
   *
   * Es lo que convierte un contador en una herramienta de planificacion: dos
   * unidades a las que les faltan los mismos kilometros pueden estar a una
   * semana o a dos meses segun cuanto trabajen.
   */
  readonly diasEstimados: number | null;
  readonly fechaEstimada: string | null;
}

export interface ResumenMantenimientos {
  readonly total: number;
  readonly overdue: number;
  readonly dueSoon: number;
  readonly ok: number;
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

export const ETIQUETA_NIVEL: Readonly<Record<NivelAviso, string>> = {
  ok: 'Al día',
  due_soon: 'Por vencer',
  overdue: 'Vencido',
};

export const CLASES_NIVEL: Readonly<Record<NivelAviso, string>> = {
  ok: 'bg-green-500/12 text-green-700 dark:text-green-400 ring-green-500/25',
  due_soon: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  overdue: 'bg-red-500/12 text-red-700 dark:text-red-400 ring-red-500/25',
};

/** Color de la barra de progreso. Mismo criterio que las insignias. */
export const COLOR_BARRA: Readonly<Record<NivelAviso, string>> = {
  ok: 'bg-green-500',
  due_soon: 'bg-amber-500',
  overdue: 'bg-red-500',
};

export const ETIQUETA_DIMENSION: Readonly<Record<Dimension, string>> = {
  km: 'Kilometraje',
  date: 'Fecha',
  hours: 'Horas motor',
};

// ----------------------------------------------------------------------------
//  Cliente HTTP
// ----------------------------------------------------------------------------

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  // La cookie de sesion es de otro origen: sin `credentials` no se manda.
  const respuesta = await fetch(`${API_URL}${ruta}`, { ...init, credentials: 'include' });
  if (!respuesta.ok) {
    let detalle = `La API respondió ${String(respuesta.status)}`;
    try {
      const cuerpo = (await respuesta.json()) as {
        error?: string;
        message?: string;
        details?: readonly { campo: string; problema: string }[];
      };
      // Los errores de validación traen el detalle por campo; mostrarlos es
      // mucho más útil que un "400" a secas en un formulario.
      detalle =
        cuerpo.details?.map((d) => d.problema).join('. ') ??
        cuerpo.message ??
        cuerpo.error ??
        detalle;
    } catch {
      // Respuesta sin JSON: se queda el mensaje genérico.
    }
    throw new Error(detalle);
  }
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

const json = (cuerpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

export async function obtenerPanel(): Promise<{
  rules: readonly ReglaEvaluada[];
  summary: ResumenMantenimientos;
}> {
  return pedir('/api/maintenance/overview');
}

export async function obtenerPlantillas(): Promise<readonly Plantilla[]> {
  const datos = await pedir<{ templates: readonly Plantilla[] }>('/api/maintenance/templates');
  return datos.templates;
}

export interface NuevaPlantilla {
  readonly name: string;
  readonly description?: string;
  readonly intervalKm?: number;
  readonly intervalDays?: number;
  readonly intervalEngineHours?: number;
  readonly noticeKm?: number;
  readonly noticeDays?: number;
}

export async function crearPlantilla(datos: NuevaPlantilla): Promise<number> {
  const r = await pedir<{ id: number }>('/api/maintenance/templates', json(datos));
  return r.id;
}

export async function borrarPlantilla(id: number): Promise<void> {
  await pedir(`/api/maintenance/templates/${String(id)}`, { method: 'DELETE' });
}

export async function aplicarPlantilla(
  id: number,
  deviceIds: readonly number[],
): Promise<{ creadas: number; yaExistian: number }> {
  return pedir(`/api/maintenance/templates/${String(id)}/apply`, json({ deviceIds }));
}

export interface NuevoServicio {
  readonly performedAt: string;
  readonly odometerKm?: number;
  readonly cost?: number;
  readonly vendor?: string;
  readonly notes?: string;
}

export async function registrarServicio(ruleId: number, datos: NuevoServicio): Promise<void> {
  await pedir(`/api/maintenance/rules/${String(ruleId)}/complete`, json(datos));
}

export async function borrarRegla(ruleId: number): Promise<void> {
  await pedir(`/api/maintenance/rules/${String(ruleId)}`, { method: 'DELETE' });
}

export async function obtenerHistorial(ruleId: number): Promise<readonly Servicio[]> {
  const datos = await pedir<{ services: readonly Servicio[] }>(
    `/api/maintenance/history?ruleId=${String(ruleId)}`,
  );
  return datos.services;
}
