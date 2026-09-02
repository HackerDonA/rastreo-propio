import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
   * De donde se leen las variables VITE_*.
   *
   * Por omision Vite las busca en la carpeta del proyecto (apps/web), pero
   * este monorepo tiene UN solo .env en la raiz, que es el mismo que usan
   * Docker Compose y la API. Sin esta linea, todo lo que se configure ahi
   * -VITE_API_URL, VITE_WS_URL, el centro del mapa- se ignora en silencio y
   * el frontend se queda con los valores por omision del codigo.
   *
   * Es un fallo especialmente traicionero porque esos valores por omision
   * apuntan a localhost:4000, que es justo lo que uno tiene en desarrollo:
   * todo funciona, y solo se descubre al cambiar la direccion de la API para
   * abrirla desde el celular y ver que no cambia nada.
   */
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  build: {
    rollupOptions: {
      output: {
        // MapLibre pesa ~1 MB, mas que todo el resto de la aplicacion junto.
        // Separandolo, el navegador lo cachea aparte y un cambio en nuestro
        // codigo no obliga a volver a descargarlo.
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
  server: {
    port: 5173,
    /*
     * La API se sirve por el MISMO origen que la pagina.
     *
     * Sin esto, el navegador carga la pagina de localhost:5173 y pide los datos
     * a otro host. Eso rompe dos cosas a la vez:
     *
     * 1. La cookie de sesion es `SameSite=Strict`, asi que el navegador la
     *    guarda pero NO la reenvia a un sitio distinto. El resultado es que
     *    iniciar sesion responde 200 y la siguiente peticion 401: se entra y
     *    se vuelve a salir en el mismo instante.
     *
     * 2. Si la API se declara como `localhost`, en Windows eso resuelve
     *    primero a ::1 (IPv6) y la API escucha solo en 127.0.0.1 (IPv4), asi
     *    que la peticion falla antes de salir de la maquina.
     *
     * Con el proxy no hay nada de eso: para el navegador todo es
     * localhost:5173, y quien habla con la API es Vite desde el servidor, por
     * IPv4 explicito. Ademas es lo mismo que pasara en produccion, donde Caddy
     * sirve el frontend y la API bajo un solo dominio.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      // `ws: true` es imprescindible: sin eso, Vite responde al handshake con
      // un 200 normal y el WebSocket del mapa en vivo nunca se establece.
      '/ws': { target: 'http://127.0.0.1:4000', ws: true, changeOrigin: false },
    },
    // Escucha en todas las interfaces para poder abrir el frontend desde el
    // celular en la misma red y comprobar el diseno responsivo en un telefono
    // de verdad, no en el simulador del navegador.
    host: true,
  },
});
