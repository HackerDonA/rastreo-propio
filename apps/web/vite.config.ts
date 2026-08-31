import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
