/**
 * Genera el hash de la contraseña de acceso y el secreto de cookies.
 *
 * Uso:
 *   pnpm hash-password
 *   pnpm hash-password "mi contraseña"
 *
 * Imprime las dos líneas que hay que pegar en el .env. La contraseña en claro
 * nunca se guarda en ningún lado: solo el resultado de scrypt.
 */

import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

import { hashearContrasena } from '../apps/api/src/auth.ts';

/** Mínimo razonable. Cuatro palabras al azar valen más que "P@ssw0rd". */
const LARGO_MINIMO = 12;

async function main(): Promise<void> {
  let contrasena = process.argv[2];

  if (contrasena === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    contrasena = await rl.question('Contraseña de acceso: ');
    rl.close();
  }

  if (contrasena.length < LARGO_MINIMO) {
    console.error('');
    console.error(`  La contraseña debe tener al menos ${String(LARGO_MINIMO)} caracteres.`);
    console.error('');
    console.error('  Una frase de cuatro palabras al azar es mucho más segura y mucho');
    console.error('  más fácil de recordar que algo corto lleno de símbolos.');
    console.error('');
    process.exitCode = 1;
    return;
  }

  const hash = await hashearContrasena(contrasena);
  // 32 bytes: suficiente para firmar cookies sin que nadie pueda falsificarlas.
  const secreto = randomBytes(32).toString('hex');

  console.log('');
  console.log('  Pega estas dos líneas en tu archivo .env:');
  console.log('');
  console.log(`AUTH_PASSWORD_HASH=${hash}`);
  console.log(`AUTH_COOKIE_SECRET=${secreto}`);
  console.log('');
  console.log('  Después reinicia la API. Al abrir el frontend te pedirá la contraseña.');
  console.log('');
  console.log('  El AUTH_COOKIE_SECRET firma las sesiones: si lo cambias, todas las');
  console.log('  sesiones abiertas dejan de valer. Eso es justo lo que quieres si');
  console.log('  sospechas que alguien más tuvo acceso.');
  console.log('');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
