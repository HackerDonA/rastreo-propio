/**
 * Registro del service worker y deteccion de "instalable".
 *
 * Separado de los componentes porque nada de esto es React: son APIs del
 * navegador que conviene tener en un solo sitio, con sus rarezas explicadas.
 */

/** Evento no estandar de Chromium; TypeScript no lo conoce. */
interface EventoInstalacion extends Event {
  readonly platforms: readonly string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendiente: EventoInstalacion | null = null;
const suscriptores = new Set<(disponible: boolean) => void>();

function avisar(): void {
  for (const s of suscriptores) s(pendiente !== null);
}

/**
 * Registra el service worker.
 *
 * Solo en produccion: en desarrollo el service worker cachearia los modulos
 * que Vite sirve sin hash y veriamos codigo viejo despues de cada guardado,
 * que es una forma peculiar de perder una tarde.
 */
export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Que falle no es motivo para romper la aplicacion: sin service worker
      // simplemente no es instalable, pero funciona igual con conexion.
    });
  });
}

/**
 * Empieza a escuchar si el navegador ofrece instalar.
 *
 * Chrome y Edge disparan `beforeinstallprompt` y dejan mostrar el dialogo
 * cuando queramos, siempre que sea dentro de un gesto del usuario. Safari en
 * iOS **no dispara nada**: alli la instalacion es manual (Compartir -> Agregar
 * a inicio), y por eso `esIOS()` existe.
 */
export function escucharInstalacion(): void {
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto, Chrome muestra su propia barra y perdemos el control de
    // cuando se ofrece.
    evento.preventDefault();
    pendiente = evento as EventoInstalacion;
    avisar();
  });

  window.addEventListener('appinstalled', () => {
    pendiente = null;
    avisar();
  });
}

/** Avisa cuando cambia la disponibilidad. Devuelve la funcion para dejar de escuchar. */
export function alCambiarInstalacion(fn: (disponible: boolean) => void): () => void {
  suscriptores.add(fn);
  fn(pendiente !== null);
  return () => {
    suscriptores.delete(fn);
  };
}

/** Lanza el dialogo del navegador. Devuelve true si el usuario acepto. */
export async function instalar(): Promise<boolean> {
  if (pendiente === null) return false;
  await pendiente.prompt();
  const { outcome } = await pendiente.userChoice;
  // El evento es de un solo uso: una vez mostrado hay que esperar a que el
  // navegador lo vuelva a disparar.
  pendiente = null;
  avisar();
  return outcome === 'accepted';
}

/** ¿La aplicacion ya se abrio desde el icono, en vez de desde el navegador? */
export function estaInstalada(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari en iOS no implementa display-mode; usa esta propiedad propia.
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * ¿Es un iPhone o iPad?
 *
 * El iPad con iPadOS 13+ se declara "Macintosh" en el userAgent, asi que hay
 * que distinguirlo por el soporte tactil: un Mac de verdad no tiene puntos de
 * contacto.
 */
export function esIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return true;
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
