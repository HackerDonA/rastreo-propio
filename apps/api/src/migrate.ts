/**
 * Aplicador de migraciones del esquema `app`.
 *
 * Deliberadamente simple: lee los .sql de migrations/ en orden alfabético,
 * aplica los que falten y anota cuáles ya corrieron. No borra ni revierte.
 *
 * No se usa Liquibase ni una herramienta de migraciones grande porque Traccar
 * ya corre Liquibase sobre el esquema `public` de esta misma base. Meter una
 * segunda herramienta que apunte a la misma base es pedir un conflicto; un
 * archivo de SQL versionado y una tabla de control es todo lo que hace falta
 * para nuestras cuatro tablas.
 *
 * Cada migración corre dentro de una TRANSACCIÓN: si falla a la mitad, no deja
 * el esquema a medias.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { AppLogger } from './lib/logger.ts';
import { pool } from './db.ts';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

interface FilaAplicada {
  readonly name: string;
}

export async function migrar(logger: AppLogger): Promise<void> {
  // La tabla de control vive en `app`, igual que todo lo nuestro. Se crea
  // aparte de las migraciones porque es lo que permite saber cuáles corrieron.
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS app;
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query<FilaAplicada>('SELECT name FROM app.schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.name));

  const archivos = (await readdir(CARPETA)).filter((f) => f.endsWith('.sql')).sort();
  const pendientes = archivos.filter((f) => !aplicadas.has(f));

  if (pendientes.length === 0) {
    logger.info({ total: archivos.length }, 'Esquema app al día');
    return;
  }

  for (const archivo of pendientes) {
    const sql = await readFile(join(CARPETA, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO app.schema_migrations (name) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      logger.info({ archivo }, 'Migración aplicada');
    } catch (error) {
      await cliente.query('ROLLBACK');
      const mensaje = error instanceof Error ? error.message : String(error);
      logger.error({ archivo, err: mensaje }, 'Falló la migración; no se aplicó nada de ella');
      throw error;
    } finally {
      cliente.release();
    }
  }
}
