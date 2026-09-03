import { describe, expect, it } from 'vitest';

import { resolverWsUrl } from './ws-url.ts';

describe('resolverWsUrl', () => {
  it('trata la cadena vacía como "sin configurar"', () => {
    // Este es el caso que rompió la aplicación en desarrollo. `VITE_WS_URL=`
    // en el .env NO llega como undefined: llega como cadena vacía, así que un
    // `?? valorPorOmision` no se activa y la URL se quedaba en ''.
    //
    // `new WebSocket('')` falla al instante, y el sintoma era desconcertante:
    // la aplicación cargaba y los datos se veían -por HTTP la cadena vacía es
    // justo lo que se quiere, una ruta relativa- pero el indicador de la barra
    // decía "Sin conexión" para siempre.
    expect(resolverWsUrl('', 'http:', 'localhost:5173')).toBe('ws://localhost:5173/ws');
  });

  it('trata undefined como "sin configurar"', () => {
    expect(resolverWsUrl(undefined, 'http:', 'localhost:5173')).toBe(
      'ws://localhost:5173/ws',
    );
  });

  it('usa wss cuando la página va por HTTPS', () => {
    // Un `ws://` fijo funciona en desarrollo y falla en producción: sobre
    // HTTPS el navegador bloquea un WebSocket sin cifrar sin avisar en la
    // interfaz.
    expect(resolverWsUrl('', 'https:', 'rastreo.ejemplo.com')).toBe(
      'wss://rastreo.ejemplo.com/ws',
    );
  });

  it('conserva el puerto del host', () => {
    expect(resolverWsUrl(undefined, 'http:', '127.0.0.1:4173')).toBe(
      'ws://127.0.0.1:4173/ws',
    );
  });

  it('respeta un valor configurado a mano', () => {
    // Sirve para el caso en que el frontend y la API vivan en dominios
    // distintos, que es el unico motivo para rellenar VITE_WS_URL.
    expect(resolverWsUrl('wss://api.ejemplo.com/ws', 'https:', 'app.ejemplo.com')).toBe(
      'wss://api.ejemplo.com/ws',
    );
  });
});
