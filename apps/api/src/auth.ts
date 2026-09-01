/**
 * Autenticación del BFF.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Hasta ahora la API no pedía nada. En desarrollo daba igual: escucha en
 * 127.0.0.1 y solo la alcanza esta máquina. Pero `docs/04-migrar-a-produccion`
 * dice cómo ponerla detrás de Caddy con HTTPS, y en ese momento **cualquiera en
 * internet podría apagarle el motor a un camión**, borrar geocercas o generar
 * enlaces públicos de ubicación.
 *
 * POR QUÉ UNA SOLA CONTRASEÑA Y NO USUARIOS
 * -----------------------------------------
 * Esta es una flota de diez vehículos con un operador. Un sistema de usuarios
 * con roles sería más código, más superficie de ataque y más que mantener, para
 * un problema que aquí no existe. Cuando haya que dar acceso a un tercero, la
 * vía correcta es un enlace de ubicación (temporal y de solo lectura), que ya
 * está implementado.
 *
 * Si algún día hacen falta cuentas separadas, el camino es delegar en el propio
 * Traccar: ya tiene usuarios y permisos por unidad.
 *
 * CÓMO SE GUARDA LA CONTRASEÑA
 * ----------------------------
 * Nunca en claro. Se guarda el resultado de scrypt con sal aleatoria. scrypt
 * está pensado para ser lento y costoso en memoria, que es justo lo que frena
 * un ataque por fuerza bruta; un SHA-256 a secas se prueba a millones por
 * segundo en una tarjeta gráfica.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `scrypt` con promesa.
 *
 * Se envuelve a mano en vez de con `promisify` porque este tiene varias
 * sobrecargas y `promisify` se queda con la que NO acepta opciones; sin
 * opciones no se puede subir el límite de memoria, que es imprescindible aquí.
 */
function scryptAsync(
  contrasena: string,
  sal: Buffer,
  largo: number,
  opciones: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(contrasena, sal, largo, opciones, (error, clave) => {
      if (error !== null) rechazar(error);
      else resolver(clave);
    });
  });
}

/** Parámetros de scrypt. N=2^16 tarda ~100 ms, que es tolerable al entrar. */
const SCRYPT_N = 65_536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const LARGO_CLAVE = 64;

/**
 * Memoria máxima que se le permite a scrypt.
 *
 * scrypt necesita 128 · N · r bytes, que con estos parámetros son 64 MB. El
 * límite POR OMISIÓN de Node es 32 MB, así que sin declarar esto la llamada
 * falla con "memory limit exceeded" — y falla al INICIAR SESIÓN, que es el
 * peor momento posible para descubrirlo.
 *
 * Ese consumo de memoria no es un efecto secundario: es justo lo que hace caro
 * atacar scrypt con tarjetas gráficas, donde la memoria por núcleo es el
 * recurso escaso.
 */
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

const OPCIONES_SCRYPT = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: SCRYPT_MAXMEM,
} as const;

/** Genera el valor que va en AUTH_PASSWORD_HASH. */
export async function hashearContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = await scryptAsync(contrasena, sal, LARGO_CLAVE, OPCIONES_SCRYPT);
  // Formato: scrypt$<sal en hex>$<clave en hex>. Autodescriptivo, para que
  // dentro de un año se entienda qué es esa cadena en el .env.
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

/**
 * Comprueba una contraseña contra su hash.
 *
 * La comparación es en tiempo constante. Un `===` normal termina en cuanto
 * encuentra el primer byte distinto, y esa diferencia de microsegundos, medida
 * muchas veces, deja adivinar el hash byte a byte.
 */
export async function verificarContrasena(
  contrasena: string,
  hash: string,
): Promise<boolean> {
  const partes = hash.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  const salHex = partes[1];
  const claveHex = partes[2];
  if (salHex === undefined || claveHex === undefined) return false;

  let esperada: Buffer;
  try {
    esperada = Buffer.from(claveHex, 'hex');
  } catch {
    return false;
  }
  if (esperada.length !== LARGO_CLAVE) return false;

  const derivada = await scryptAsync(
    contrasena,
    Buffer.from(salHex, 'hex'),
    LARGO_CLAVE,
    OPCIONES_SCRYPT,
  );

  return timingSafeEqual(derivada, esperada);
}

/**
 * Rutas que NO exigen sesión, y por qué cada una.
 *
 * La lista es explícita y corta a propósito: es más seguro tener que añadir
 * una excepción a mano que proteger cada ruta nueva por separado y olvidarse
 * de alguna.
 */
export function esRutaPublica(url: string): boolean {
  // Sonda de salud: la consultan los monitores y no revela nada sensible.
  if (url === '/health') return true;
  // Iniciar y cerrar sesión, evidentemente.
  if (url.startsWith('/api/auth/')) return true;
  // Enlaces de ubicación: públicos por diseño, y ya limitan lo que exponen.
  if (url.startsWith('/api/share/')) return true;
  return false;
}
