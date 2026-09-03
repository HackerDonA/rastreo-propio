/**
 * Resolucion de la direccion del WebSocket.
 *
 * Vive en su propio archivo, separado de `api.ts`, por una razon concreta:
 * `api.ts` lee `window.location` al cargarse, y eso hace que importarlo
 * reviente fuera de un navegador. Al estar aqui, la logica se puede probar sin
 * simular un DOM entero solo para comprobar como se arma una cadena.
 */

/**
 * Decide a que URL conectar el WebSocket.
 *
 * @param configurado Valor de VITE_WS_URL, si lo hay.
 * @param protocolo   `window.location.protocol` ('http:' o 'https:').
 * @param host        `window.location.host`, con puerto incluido.
 *
 * Sin valor configurado se deriva de la pagina, para que herede su host y su
 * esquema. Escribir `ws://` fijo funcionaria en desarrollo y fallaria en
 * produccion: sobre HTTPS el navegador bloquea un WebSocket sin cifrar.
 *
 * OJO: la comprobacion es contra la CADENA VACIA, no solo contra `undefined`.
 * Una variable declarada como `VITE_WS_URL=` en el .env llega como '', asi que
 * un `??` no aplicaria el valor por omision y quedaria una URL vacia.
 */
export function resolverWsUrl(
  configurado: string | undefined,
  protocolo: string,
  host: string,
): string {
  if (configurado !== undefined && configurado !== '') return configurado;
  return `${protocolo === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
}
