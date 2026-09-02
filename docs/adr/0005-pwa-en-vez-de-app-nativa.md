# ADR 0005 · PWA instalable en vez de aplicación nativa

- **Fecha:** 2026-09-02
- **Estado:** Aceptada

## Contexto

El requisito es que esto se use como aplicación en **iPhone, Android, iPad,
tablet y PC**. Cinco destinos, tres sistemas operativos, un solo desarrollador.

El frontend ya existe: React 19 + Vite + MapLibre, y todo lo que muestra viene
del BFF por HTTP y WebSocket. La pregunta no es qué construir, sino cómo
empaquetar y distribuir lo que ya está construido.

Y hay una restricción del proyecto que no es negociable: **ningún servicio de
pago**. Es la razón de existir del proyecto — sustituir la suscripción de
Ruhavik. Reemplazar una mensualidad por otra cuota anual sería perder el
argumento entero.

## Decisión

**Progressive Web App instalable.** Manifest, service worker, iconos y las
etiquetas propias de iOS. La misma aplicación que ya se sirve en el navegador
se instala en la pantalla de inicio y se abre sin barra de navegador.

Se descartan, por ahora, Capacitor y React Native.

## Motivos

### El costo de las tiendas es el factor decisivo

Publicar en la App Store exige el **Apple Developer Program: 99 USD al año**,
para siempre, o la aplicación deja de estar disponible. Google Play cobra 25
USD una sola vez.

Ruhavik para diez unidades cuesta del orden de esa cifra. Cambiar una
suscripción por otra —y encima recurrente, y encima solo para la mitad de los
dispositivos— contradice el objetivo del proyecto.

La PWA cuesta **cero** y llega a los cinco destinos.

### Un solo código, sin una segunda aplicación que mantener

React Native significaría un segundo proyecto: otro árbol de componentes, otro
mapa (`react-native-maps` en vez de MapLibre GL JS), otras dependencias, otro
pipeline. Cada funcionalidad nueva habría que escribirla dos veces, y la
versión que se quede atrás es siempre la que menos se usa.

La PWA es el mismo `apps/web` que ya se está construyendo.

### Publicar un cambio es un `git push`

Sin revisión de tienda, sin esperar días por un arreglo de una línea, sin
usuarios en versiones viejas. Para una herramienta interna de una flota
pequeña, la distribución por tienda no aporta nada: no hay que descubrirla en
un buscador, la van a abrir tres personas conocidas.

### Lo único que se pierde no se necesita

Una PWA no puede rastrear **el propio teléfono** en segundo plano. Es una
limitación real y es la razón habitual para irse a nativo en aplicaciones de
rastreo.

Aquí no aplica: lo que se rastrea son vehículos con su propio equipo GPS
(Concox GT06N, Coban GPS103-B) reportando a Traccar por su cuenta. El teléfono
solo mira el mapa.

Las notificaciones sí funcionan: Web Push llega a iOS desde la versión 16.4,
con la condición de que la aplicación esté instalada en la pantalla de inicio.

### No es trabajo tirado si algún día se va a las tiendas

**Capacitor envuelve exactamente esta misma PWA** en un contenedor nativo y la
sube a las tiendas, sin reescribir nada. Es decir: hacer la PWA ahora es el
requisito previo de esa ruta, no una alternativa a ella.

Si algún día hace falta publicar en tiendas —por ejemplo para vender el sistema
a terceros— el camino es Capacitor y el trabajo de hoy se aprovecha entero.

## Consecuencias

### A favor

- Cinco destinos con un código y sin costo.
- Se instala y se actualiza sola.
- La ruta a tiendas sigue abierta vía Capacitor.

### En contra

- **Exige HTTPS.** Los navegadores no instalan una PWA servida por `http://`
  (salvo en `localhost`). Deja la instalación supeditada al despliegue de
  [`04-migrar-a-produccion.md`](../04-migrar-a-produccion.md). En la red local
  se puede probar el diseño, pero no instalar.
- **En iOS la instalación es manual.** Safari no dispara
  `beforeinstallprompt`; hay que explicar Compartir → Agregar a inicio. La
  aplicación lo detecta y muestra la instrucción, pero no puede automatizarlo.
- **Sin rastreo del propio dispositivo en segundo plano.** Aceptado: no es el
  caso de uso.
- **Cada plataforma tiene su propio pliego de rarezas** — iOS ignora el
  manifest y necesita sus `apple-*`; con `viewport-fit=cover` hay que respetar
  los `safe-area-inset` a mano. Está resuelto y comentado en `index.html` e
  `index.css`.

### Una decisión de diseño que se deriva de esta

El service worker **no cachea `/api/*`**. Podría, y la aplicación se sentiría
más rápida sin conexión. Pero una posición guardada se ve idéntica a una
posición real, y mostrar un vehículo en una calle donde ya no está es peor que
no mostrar nada. Se cachea el programa; los datos, nunca.
