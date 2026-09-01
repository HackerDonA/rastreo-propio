/// <reference types="vite/client" />

/**
 * Tipado de las variables de entorno del frontend.
 *
 * Sin esto, `import.meta.env['LO_QUE_SEA']` es `any`, y cualquier valor leído
 * de ahí se propaga sin tipo por el resto del código. Declararlas además
 * documenta en un solo lugar qué configuración entiende el frontend.
 *
 * Solo las que empiezan con VITE_ llegan al navegador; todo lo que se declare
 * aquí termina en el bundle público, así que nada secreto.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_MAP_STYLE_LIGHT?: string;
  readonly VITE_MAP_STYLE_DARK?: string;
  readonly VITE_MAP_CENTER_LNG?: string;
  readonly VITE_MAP_CENTER_LAT?: string;
  readonly VITE_MAP_ZOOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
