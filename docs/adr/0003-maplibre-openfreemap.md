# ADR 0003 · MapLibre GL JS + OpenFreeMap para los mapas

- **Fecha:** 2026-08-31
- **Estado:** Aceptada

## Contexto

El mapa es la pantalla principal de la aplicación: 10 unidades moviéndose en vivo,
rutas históricas de miles de puntos, modo claro y oscuro. Un proyecto de rastreo
carga mapas todo el día, todos los días.

Un mapa web tiene dos piezas independientes: la **biblioteca** que dibuja, y el
**servicio de tiles** que provee los datos. Se eligen por separado.

## Decisión

- **Biblioteca:** MapLibre GL JS (BSD-3-Clause)
- **Tiles:** OpenFreeMap, estilos `liberty` (claro) y `dark` (oscuro)

## Motivos

### Nada de servicios que cobran por carga

Google Maps y Mapbox cobran por carga de mapa. Un panel de rastreo abierto ocho
horas al día recarga tiles constantemente, y esos modelos están pensados para
sitios donde el mapa se ve una vez. Es exactamente el tipo de costo variable que
este proyecto existe para eliminar: se cambió una mensualidad fija de Ruhavik por
una factura que crece con el uso.

Además ambos exigen una API key, que es otro secreto que administrar y que en el
frontend queda expuesta por definición.

### Por qué MapLibre

- Es el *fork* comunitario de Mapbox GL JS v1, de antes del cambio de licencia.
  API prácticamente idéntica, sin las restricciones.
- Renderiza con WebGL, así que aguanta bien miles de puntos: importa para dibujar
  un mes de historial.
- Trae de fábrica lo que necesitamos: agrupamiento de marcadores por fuente
  GeoJSON (`cluster: true`), rotación de íconos por rumbo, y capas de línea para
  las rutas.
- Los estilos son JSON: alternar claro/oscuro es cambiar una URL, no otro mapa.

### Por qué OpenFreeMap

- **Sin registro, sin API key, sin cookies.** Un secreto menos.
- **Sin límite de peticiones ni de vistas**, y permite uso comercial. Solo pide
  atribución a OpenFreeMap, OpenMapTiles y OpenStreetMap.
- Sirve tiles vectoriales compatibles con MapLibre directamente.
- Estilos verificados y respondiendo: `liberty`, `bright`, `positron`, `dark`,
  `fiord` en `https://tiles.openfreemap.org/styles/<nombre>`.
- Si algún día desaparece, se puede autoalojar: el proyecto publica cómo.

## Consecuencias

**A favor**

- Costo de mapas: cero, sin importar cuánto se use.
- Sin API keys que administrar ni que filtrar.
- Cambiar de proveedor de tiles es cambiar una variable de entorno
  (`VITE_MAP_STYLE_LIGHT` / `VITE_MAP_STYLE_DARK`).

**En contra**

- **Los tiles necesitan internet.** Es la única parte del proyecto que no funciona
  sin conexión. Todo lo demás (Traccar, base de datos, API, simulador) corre
  aislado. Si algún día hace falta operar sin red, la salida es autoalojar los
  tiles.
- OpenFreeMap es un proyecto pequeño, sin acuerdo de nivel de servicio. Aceptable
  para uso personal; para producción crítica habría que autoalojar.
- Sin ruteo ni geocodificación incluidos. No los necesitamos: Traccar calcula
  distancias y viajes, y la geocodificación inversa la puede hacer él mismo
  contra Nominatim si algún día la queremos.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Google Maps** | De pago por carga. Prohibido explícitamente en este proyecto. |
| **Mapbox GL JS** | De pago por carga, y licencia restrictiva desde la v2. MapLibre es el mismo motor sin eso. |
| **Leaflet + tiles de OSM** | Leaflet es más simple, pero dibuja en raster: con miles de puntos de historial se arrastra. Además el servidor de tiles público de OSM prohíbe explícitamente el uso de aplicaciones en producción. |
| **MapTiler / Stadia** | Buenos servicios, pero con capa gratuita limitada y API key. Vuelve el costo variable y el secreto. |
