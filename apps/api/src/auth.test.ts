/**
 * Pruebas de la autenticación.
 *
 * Es el código que decide quién puede apagarle el motor a un camión, así que
 * los casos frontera importan más de lo habitual.
 */

import { describe, expect, it } from 'vitest';

import { esRutaPublica, hashearContrasena, verificarContrasena } from './auth.ts';

describe('hashearContrasena', () => {
  it('nunca guarda la contraseña en claro', async () => {
    const hash = await hashearContrasena('miContrasenaSecreta');
    expect(hash).not.toContain('miContrasenaSecreta');
  });

  it('usa una sal distinta cada vez', async () => {
    // Sin sal aleatoria, dos personas con la misma contraseña tendrían el
    // mismo hash, y una tabla precalculada las rompe a las dos de golpe.
    const a = await hashearContrasena('igual');
    const b = await hashearContrasena('igual');
    expect(a).not.toBe(b);
  });

  it('produce un formato autodescriptivo', async () => {
    const hash = await hashearContrasena('x');
    expect(hash).toMatch(/^scrypt\.[0-9a-f]{32}\.[0-9a-f]{128}$/);
  });
});

describe('verificarContrasena', () => {
  it('acepta la correcta', async () => {
    const hash = await hashearContrasena('correcta');
    expect(await verificarContrasena('correcta', hash)).toBe(true);
  });

  it('rechaza la incorrecta', async () => {
    const hash = await hashearContrasena('correcta');
    expect(await verificarContrasena('incorrecta', hash)).toBe(false);
  });

  it('distingue mayúsculas', async () => {
    const hash = await hashearContrasena('Secreta');
    expect(await verificarContrasena('secreta', hash)).toBe(false);
  });

  it('rechaza la cadena vacía', async () => {
    const hash = await hashearContrasena('algo');
    expect(await verificarContrasena('', hash)).toBe(false);
  });

  it('no revienta con un hash malformado', async () => {
    // Un .env mal editado no debe tumbar el servidor ni, peor, dejar pasar.
    for (const malo of ['', 'basura', 'scrypt.solo-dos', 'md5.aa.bb', 'scrypt..']) {
      expect(await verificarContrasena('x', malo)).toBe(false);
    }
  });

  it('rechaza un hash con la clave de largo incorrecto', async () => {
    expect(await verificarContrasena('x', 'scrypt.aabb.ccdd')).toBe(false);
  });

  it('rechaza el formato viejo separado por $', async () => {
    // El separador se cambió a `.` porque Docker Compose interpreta `$` como
    // interpolación de variables al leer el mismo .env. Un hash del formato
    // anterior tiene que fallar de forma limpia, no colarse ni reventar: se
    // regenera con `.\iniciar.ps1 -CambiarContrasena`.
    expect(
      await verificarContrasena('x', `scrypt$${'aa'.repeat(16)}$${'bb'.repeat(64)}`),
    ).toBe(false);
  });
});

describe('esRutaPublica', () => {
  it('deja pasar solo lo que debe', () => {
    expect(esRutaPublica('/health')).toBe(true);
    expect(esRutaPublica('/api/auth/login')).toBe(true);
    expect(esRutaPublica('/api/share/abc123')).toBe(true);
  });

  it('protege TODO lo que modifica datos', () => {
    // Esta es la prueba que de verdad importa: si alguna de estas se colara,
    // cualquiera podría operar la flota.
    for (const ruta of [
      '/api/units',
      '/api/units/1/commands',
      '/api/geofences',
      '/api/vehicles/1',
      '/api/maintenance/overview',
      '/api/units/1/share',
      '/ws',
    ]) {
      expect(esRutaPublica(ruta)).toBe(false);
    }
  });

  it('no se deja engañar por rutas parecidas', () => {
    // `/api/shareXXX` no es `/api/share/`.
    expect(esRutaPublica('/api/shared-secrets')).toBe(false);
    expect(esRutaPublica('/healthz')).toBe(false);
  });
});
