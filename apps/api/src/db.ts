/**
 * Acceso directo a PostgreSQL.
 *
 * Se usa SOLO para consultas pesadas donde la API de Traccar se queda corta,
 * concretamente el historial: un mes de una unidad son ~170 000 puntos, y la
 * API de Traccar ademas corta en `report.maxPositions` (50 000 por omision).
 *
 * REGLA DEL PROYECTO: las tablas tc_* se LEEN, nunca se escriben. Nuestras
 * tablas viven en el esquema `app`. Ver docs/adr/0004-schema-app-separado.md.
 */

import pg from 'pg';

import { config } from './config.ts';

// Traccar guarda los timestamps sin zona horaria (TIMESTAMP). Sin esto, node-pg
// los interpreta como hora local de Windows y todo el historial sale desfasado
// por las horas que tenga el huso local. 1114 = TIMESTAMP WITHOUT TIME ZONE.
pg.types.setTypeParser(1114, (value: string) => new Date(`${value}Z`).toISOString());

export const pool = new pg.Pool({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
