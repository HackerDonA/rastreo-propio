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
    // Escucha en todas las interfaces para poder abrir el frontend desde el
    // celular en la misma red y comprobar el diseno responsivo en un telefono
    // de verdad, no en el simulador del navegador.
    host: true,
  },
});
