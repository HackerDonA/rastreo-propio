# Instalar la aplicación en el celular, la tablet y la PC

La aplicación es una **PWA**: se instala en la pantalla de inicio, se abre con
su propio icono y sin la barra del navegador, y funciona igual en iPhone,
Android, iPad, tablet y computadora. Es el mismo código en los cinco sitios.

---

## Por qué una PWA y no una app de las tiendas

Fue una decisión, no una limitación. Ver
[`adr/0005-pwa-en-vez-de-app-nativa.md`](adr/0005-pwa-en-vez-de-app-nativa.md)
para el razonamiento completo, pero el resumen es:

| | PWA | App nativa en tiendas |
|---|---|---|
| Costo | **$0** | Apple **99 USD/año** + Google 25 USD una vez |
| Código | El que ya existe | Otro proyecto que mantener |
| Publicar un cambio | Subes y ya | Revisión de Apple, días |
| iPhone, Android, iPad, PC | Sí | Sí |
| Notificaciones | Sí (iOS 16.4+, ya instalada) | Sí |
| Rastrear **el propio teléfono** en segundo plano | No | Sí |

Ese último renglón es el único que la PWA no cubre, y no aplica aquí: lo que
se rastrea son vehículos con su propio equipo GPS, no el celular de quien mira.

> **Requisito previo:** para instalarla desde fuera de tu casa necesitas la
> aplicación publicada con HTTPS. Los navegadores solo permiten instalar sobre
> HTTPS (con `localhost` como única excepción). Eso está en
> [`04-migrar-a-produccion.md`](04-migrar-a-produccion.md).

---

## Android · Chrome, Edge, Brave

1. Abre la aplicación en el navegador.
2. Aparece abajo una barra **Instalar Rastreo** → toca **Instalar**.
3. Si la descartaste: menú **⋮** → **Instalar aplicación** o **Agregar a
   pantalla principal**.

Queda en el cajón de aplicaciones como cualquier otra, con su icono y su
entrada en el selector de tareas.

---

## iPhone y iPad · Safari

En iOS la instalación es **manual**: Apple no permite que una página ofrezca
instalarse sola. La aplicación te muestra el recordatorio, pero los pasos los
das tú:

1. Abre la aplicación **en Safari** (Chrome en iOS no puede instalar PWAs).
2. Toca el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Desliza y elige **Agregar a inicio**.
4. Confirma con **Agregar**.

Aparece en la pantalla de inicio con el icono índigo.

> **Ábrela siempre desde el icono, no desde Safari.** Instalada corre en su
> propio contenedor: pantalla completa, sin barra de direcciones, y con su
> propia sesión. Es también la única forma de recibir notificaciones en iOS.

---

## Windows, macOS y Linux · Chrome o Edge

1. Abre la aplicación.
2. En la barra de direcciones aparece un icono de **instalar** (una pantalla
   con una flecha) → clic → **Instalar**.
3. También desde el menú **⋮** → **Instalar Rastreo…**

Queda como una aplicación de escritorio, con su icono en el menú de inicio y
en la barra de tareas.

---

## Qué funciona sin conexión

**La aplicación abre. Los datos no aparecen.** Es deliberado.

El service worker guarda el programa —HTML, JavaScript, CSS, iconos— pero
**nunca** guarda las respuestas de `/api/*`. Servir una posición guardada
significaría pintar un camión en una calle donde ya no está, con exactamente
el mismo aspecto que un dato bueno. Una posición equivocada es peor que
ninguna: no se distingue de la correcta.

Así que sin señal verás la aplicación con su pantalla de error habitual, y en
cuanto vuelva la conexión se llena sola.

---

## Comprobar que quedó bien instalada

| Señal | Qué significa |
|---|---|
| Se abre **sin barra de direcciones** | Está corriendo instalada |
| El icono es el pin índigo, no una captura de la página | iOS leyó `apple-touch-icon` |
| El contenido **no queda debajo del notch** | Las áreas seguras funcionan |
| Aparece en el selector de apps con su nombre | El manifest se leyó bien |

Si en iOS el icono sale como una miniatura de la página, la instalaste desde
un navegador que no era Safari.

---

## Probarla en tu teléfono **antes** de publicar

No hace falta esperar a producción. El servidor de desarrollo ya escucha en
toda la red local:

```powershell
# 1. Tu IP en la red local (busca "IPv4" de tu adaptador Wi-Fi)
ipconfig

# 2. Permitir el puerto del frontend en el firewall (una sola vez, como admin)
New-NetFirewallRule -DisplayName "Rastreo dev 5173" -Direction Inbound `
  -Protocol TCP -LocalPort 5173 -Action Allow

# 3. Levantar todo
pnpm dev
```

Desde el celular, **en la misma red Wi-Fi**, abre `http://192.168.1.X:5173`
con la IP del paso 1.

Dos cosas que hay que saber de esta prueba:

- **No podrás instalarla así.** Es `http://`, no `https://`, y no es
  `localhost`. Sirve para revisar el diseño en una pantalla de verdad, que es
  el 90% del valor.
- **La API tiene que ser alcanzable también.** Si `VITE_API_URL` apunta a
  `localhost`, desde el celular eso significa *el propio celular*. Cámbiala a
  la IP de tu PC en el `.env` mientras pruebas, y acuérdate de agregar esa
  misma dirección a `CORS_ORIGIN`.

---

## Notificaciones

Los avisos de geocercas y alarmas llegan hoy por WebSocket mientras la
aplicación está abierta, y el navegador los muestra como notificación del
sistema si le diste permiso.

Para recibirlas con la aplicación **cerrada** hace falta Web Push, que es
trabajo aparte: un par de claves VAPID, guardar la suscripción de cada
dispositivo y que el service worker escuche `push`. En iOS solo funciona si la
aplicación está instalada en la pantalla de inicio (desde iOS 16.4). Está
anotado como pendiente en el README.
