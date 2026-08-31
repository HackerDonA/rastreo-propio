# 02 · Conectar mis GPS reales

Guía para identificar qué rastreadores tienes, configurarlos y migrarlos desde
Ruhavik a tu propio servidor. Escrita como **procedimiento repetible**, no como
receta de un caso, porque diez equipos pueden ser de marcas distintas.

> ⚠️ **La advertencia más importante de todo el proyecto**
>
> Los comandos SMS de esta guía están tomados de manuales de fabricante y de la
> documentación de Traccar, y cada uno lleva su fuente. Aun así: **la sintaxis
> cambia entre modelos de la misma marca, y entre versiones de firmware del
> mismo modelo.**
>
> Un comando mal escrito puede dejar el rastreador apuntando a un servidor que
> no existe, y entonces ya no responde ni por SMS ni por internet: hay que
> desmontarlo del vehículo. **Verifica siempre contra el manual de tu modelo
> exacto antes de mandar nada.**

---

## Índice

- [(a) Qué rastreador tengo](#a-qué-rastreador-tengo)
- [(b) Protocolos y puertos](#b-protocolos-y-puertos)
- [(c) Leer los logs de Traccar](#c-leer-los-logs-de-traccar)
- [(d) Comandos SMS de configuración](#d-comandos-sms-de-configuración)
- [(e) APN de operadores mexicanos](#e-apn-de-operadores-mexicanos)
- [(f) La zona horaria en UTC 0](#f-la-zona-horaria-en-utc-0)
- [(g) Probar sin tocar mis rastreadores](#g-probar-sin-tocar-mis-rastreadores)
- [(h) Que un rastreador real llegue a mi máquina](#h-que-un-rastreador-real-llegue-a-mi-máquina)
- [(i) Migrar desde Ruhavik](#i-migrar-desde-ruhavik)
- [(j) Solución de problemas](#j-solución-de-problemas)
- [(k) Checklist para dar de alta un rastreador](#k-checklist-para-dar-de-alta-un-rastreador)
- [Inventario de mis unidades](#inventario-de-mis-unidades)

---

## (a) Qué rastreador tengo

Cuatro métodos, del más rápido al más lento. Empieza por el 1 y baja solo si
hace falta.

### Método 1 — La pestaña Hardware de Ruhavik ⭐ el más rápido

En Ruhavik: **Ajustes de la unidad → pestaña Hardware**. Ahí aparece el **tipo de
dispositivo** y el **identificador** (normalmente el IMEI).

El problema es que Ruhavik usa los nombres de hardware de Wialon/flespi, que **no
son idénticos** a los nombres de protocolo de Traccar. Esta tabla traduce los
más comunes:

| Lo que dice Ruhavik / Wialon | Protocolo en Traccar | Puerto |
|---|---|---|
| `GT06`, `Concox GT06`, `GPS06` | `gt06` | 5023 |
| `GT02`, `Concox GT02` | `gt02` | 5022 |
| `H02`, `Chinese H02`, `SinoTrack` | `h02` | 5013 |
| `GPS103`, `Coban GPS103`, `TK103` | `gps103` | 5001 |
| `TK103-2`, `Coban TK103-2` | `tk103` | 5002 |
| `Teltonika FMxxxx`, `Teltonika FMB` | `teltonika` | 5027 |
| `Meitrack`, `MVT`, `MT90` | `meitrack` | 5020 |
| `Queclink GL/GV` | `gl200` | 5004 |
| `JT808`, `Jimi JC`, `Huabao` | `huabao` | 5015 |
| `Watch`, `TK-Star reloj` | `watch` | 5093 |

> **Ojo con Concox/Jimi.** Los modelos viejos (GT06N, GT06E) hablan `gt06` en el
> 5023. Los nuevos de la línea Jimi IoT (JC181, JC450, VL502) hablan **JT808**,
> que en Traccar es el protocolo `huabao`, en el **5015**. Son incompatibles
> entre sí: si te equivocas de puerto, el equipo conecta y Traccar no lo entiende.

Anota el nombre exacto que veas. Si no está en la tabla, la lista completa de
equipos soportados está en <https://www.traccar.org/devices/>, con su protocolo
y su puerto.

### Método 2 — ToolBox de Ruhavik: reconocer el protocolo por su firma

En **ToolBox** puedes ver los mensajes crudos que manda el equipo. El principio
de cada paquete identifica la familia sin ambigüedad.

Esta tabla viene de la
[guía oficial de identificación de protocolos de Traccar](https://www.traccar.org/identify-protocol/):

| Cómo empieza el mensaje | Protocolo | Puerto | Cómo se ve |
|---|---|---|---|
| `78 78` o `79 79` (hex) | `gt06` | 5023 | `7878 0D 01 0356...` |
| `*HQ,` … termina en `#` | `h02` | 5013 | `*HQ,1234567890,V1,...#` |
| `imei:` … termina en `;` | `gps103` | 5001 | `imei:359586015829802,tracker,...;` |
| `7e` … termina en `7e` | `huabao` (JT808) | 5015 | `7e0200...7e` |
| `00 00 00 00` (4 ceros) | `teltonika` | 5027 | binario, arranca con ceros |
| `$$` … termina en checksum | `meitrack` | 5020 | `$$A28,353358017784062,AAA,35,...` |
| `[` + 2 mayúsculas + `*id*` | `watch` | 5093 | `[SG*8800000015*0016*...` |

**Cómo leerlo:** si el mensaje se ve como texto legible, es un protocolo de
texto (H02, GPS103, Meitrack). Si se ve como pares hexadecimales, es binario
(GT06, Teltonika, JT808).

### Método 3 — La etiqueta física del equipo

Desmontar no siempre es opción, pero si el equipo está accesible, la etiqueta
suele traer:

- **Modelo** (`GT06N`, `ST-901`, `FMB920`, `TK103-2B`)
- **IMEI** de 15 dígitos ← **este es el identificador que usarás en Traccar**
- A veces un código QR con el IMEI

> El IMEI es el dato crítico. Es lo que Traccar usa como `uniqueId` para saber
> qué vehículo mandó cada posición. Anótalo sin errores: un dígito mal y el
> equipo aparece como "Unknown device" en el log.

### Método 4 — Prueba ordenada contra Traccar

Cuando los tres anteriores no bastan. La idea: abrir varios puertos candidatos,
apuntar el equipo a uno, y leer los logs.

1. **Da de alta la unidad en Traccar** con su IMEI (Configuración → Dispositivos
   → +). Sin esto, Traccar rechaza el paquete con `Unknown device` antes de
   intentar decodificarlo, y no aprendes nada.

2. **Enciende el log detallado.** En [`infra/traccar.xml`](../infra/traccar.xml)
   cambia:
   ```xml
   <entry key='logger.level'>debug</entry>
   ```
   ```powershell
   pnpm infra:down; pnpm infra:up
   ```

3. **Apunta el equipo al puerto 5001.** Es el que recomienda la documentación
   oficial de Traccar para identificar equipos desconocidos, porque su log
   muestra el contenido crudo aunque no lo entienda.

4. **Mira los logs** y compara con la tabla de firmas del método 2:
   ```powershell
   pnpm infra:logs
   ```

5. **Reapunta al puerto correcto** y vuelve a poner `logger.level` en `info`.
   El modo `debug` llena el disco rápido.

---

## (b) Protocolos y puertos

Los más comunes en México. La lista completa está en
<https://www.traccar.org/devices/>.

| Familia | Protocolo | Puerto | Modelos típicos |
|---|---|---|---|
| **Concox / Jimi (viejos)** | `gt06` | **5023** | GT06N, GT06E, GT07, GK301, TR06, JM-VL01, y clones sin marca |
| **Concox / Jimi (nuevos)** | `huabao` | **5015** | JC181, JC182, JC371, JC450, VL502, VL533 |
| **Concox GT02** | `gt02` | 5022 | GT02, GT02A |
| **SinoTrack** | `h02` | **5013** | ST-901, ST-902, ST-903, ST-906, y clones H02 |
| **Coban** | `gps103` | **5001** | TK103, TK104, TK106, GPS-103, GPS301–306 |
| **Coban (variante)** | `tk103` | 5002 | TK103-2, TK103-2B |
| **Teltonika** | `teltonika` | **5027** | FMB001, FMB003, FMB920, FMB130, FMC130, FMB640 |
| **Meitrack** | `meitrack` | 5020 | MT80, MT88, MT90, MVT340, MVT380, T333, T366 |
| **Queclink** | `gl200` | 5004 | GL200, GL300, GV series, GT series |
| **TK-Star reloj** | `watch` | 5093 | TK909, TK915, TK935 |
| **Celular (pruebas)** | `osmand` | **5055** | App Traccar Client, nuestro simulador |

En negrita los cinco puertos que este proyecto publica por omisión en
[`infra/docker-compose.yml`](../infra/docker-compose.yml). Para abrir otro,
descoméntalo ahí y vuelve a levantar.

> **Dónde está la lista completa de puertos.** Mucha documentación vieja dice
> que están en `conf/default.xml`. **Ese archivo ya no existe en Traccar 6.**
> Hoy los 268 puertos por omisión están compilados en
> [`PortConfigSuffix.java`](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/config/PortConfigSuffix.java).
> Para consultarlos desde tu instalación, esa clase es la fuente de verdad.

---

## (c) Leer los logs de Traccar

Es la herramienta número uno. Casi cualquier pregunta de "¿por qué no funciona?"
se responde aquí.

```powershell
pnpm infra:logs
```

Deja esa ventana abierta y observa. Hay exactamente **tres** cosas que pueden
pasar, y distinguirlas te ahorra horas.

### Caso 1 — Llega y se decodifica ✅

```
INFO: [T31089c6a] connected
INFO: [T31089c6a: gt06 < 189.x.x.x] 78780d01035985600001234500089b3f0d0a
INFO: [T31089c6a: gt06 > 189.x.x.x] 787805010001d9dc0d0a
```

El `<` es lo que llegó, el `>` es lo que Traccar respondió (el ACK). Que haya
respuesta significa que entendió el paquete. La unidad ya debería verse en el
mapa.

### Caso 2 — Llega pero no se entiende ⚠️

```
INFO: [T2c3d2715] connected
INFO: [T2c3d2715: gt06 < 189.x.x.x] 2a48512c313233343536373839302c56312c...
WARN: [T2c3d2715] error - Unknown message type - ...
INFO: [T2c3d2715] disconnected
```

El equipo conecta y manda datos, pero está en el **puerto equivocado**. Fíjate en
el contenido: `2a4851` en hexadecimal es `*HQ` en texto — es un equipo **H02**
llegando al puerto de GT06. Solución: reapuntarlo al 5013.

Este es el caso donde la tabla de firmas de la sección (a) vale oro.

### Caso 3 — Llega pero la unidad no existe ⚠️

```
INFO: [T2c3d2715: osmand < 172.18.0.1] GET /?id=PRUEBA001&lat=19.43...
WARN: Unknown device - PRUEBA001 (172.18.0.1)
INFO: [T2c3d2715: osmand > 172.18.0.1] HTTP/1.1 400 Bad Request
```

Traccar decodificó bien, pero **ese identificador no está dado de alta**. Es una
protección deliberada: sin ella, cualquiera que alcance tu puerto podría crear
unidades en tu servidor.

Solución: darla de alta con ese IMEI exacto en Configuración → Dispositivos → +.

### Caso 4 — No llega absolutamente nada ❌

El log no muestra ninguna línea `connected` de esa IP. El problema **no está en
Traccar**: el paquete nunca llegó. Ve a la sección [(j)](#j-solución-de-problemas).

### Encender el log detallado

Para ver el contenido crudo de cada paquete, en
[`infra/traccar.xml`](../infra/traccar.xml):

```xml
<entry key='logger.level'>debug</entry>
```

```powershell
pnpm infra:down; pnpm infra:up
```

> **Regrésalo a `info` cuando termines.** En `debug`, un equipo reportando cada
> 10 segundos genera cientos de megabytes al día.

### Filtrar el log

```powershell
# Solo lo de un protocolo
pnpm infra:logs | Select-String "gt06"

# Solo errores y avisos
pnpm infra:logs | Select-String "WARN|ERROR"

# Buscar un IMEI concreto
pnpm infra:logs | Select-String "359586015829802"
```

---

## (d) Comandos SMS de configuración

### El orden correcto, siempre

1. **APN primero.** Sin APN el equipo no tiene internet, así que no puede
   alcanzar ningún servidor. Configurar el servidor antes es perder el tiempo.
2. **Servidor después.** Dirección y puerto.
3. **Intervalo de reporte**, si el modelo lo permite.
4. **Reinicio al final**, para que tome todo.

Después de cada comando, **espera la respuesta del equipo** antes de mandar el
siguiente. Si no contesta, no sigas: algo está mal y encadenar comandos solo lo
empeora.

> 🚨 **Antes de mandar cualquiera de estos comandos, lee esto**
>
> - Verifica la sintaxis **contra el manual de tu modelo exacto**. Las tablas de
>   abajo citan su fuente, pero un modelo distinto de la misma marca puede usar
>   otra sintaxis.
> - **Apunta a un hostname DDNS, nunca a una IP.** Si la IP cambia, tienes que
>   reconfigurar los diez vehículos por SMS uno por uno. Ver
>   [`04-migrar-a-produccion.md`](04-migrar-a-produccion.md).
> - **El puerto es el del protocolo (5023, 5013…), no el 8082.** El 8082 es la
>   interfaz web, y es la confusión más común
>   ([foro de Traccar](https://www.traccar.org/forums/topic/gt06n-cannot-connect/)).
> - Prueba con **un solo equipo** y el vehículo estacionado en casa.

---

### GT06 · Concox / Jimi (modelos GT06N y familia)

**Fuente:** manual oficial del Concox GT06N. No distingue mayúsculas de
minúsculas. El equipo responde `ok` si aceptó el comando.

| Qué hace | Comando |
|---|---|
| APN sin usuario | `APN,internet.itelcel.com#` |
| APN con usuario y contraseña | `APN,internet.itelcel.com,webgprs,webgprs2002#` |
| Servidor por **dominio** | `SERVER,1,rastreo.midominio.duckdns.org,5023,0#` |
| Servidor por IP | `SERVER,0,203.0.113.10,5023,0#` |
| Reiniciar | `RESET#` |

> El primer parámetro de `SERVER` es el tipo: **`1` = dominio, `0` = IP**.
> Equivocarlo es una de las causas más frecuentes de "configuré todo y no llega".

**Verificar contra el manual del modelo:** el comando de intervalo de reporte
(`TIMER`, `UPLOAD` o similar según versión) y el de consulta de estado.

---

### H02 · SinoTrack ST-901 y clones

**Fuente:** [manual de usuario SinoTrack ST-901](https://manuals.plus/sinotrack/st-901-gps-tracker-manual).
Contraseña por omisión: **`0000`**. La contraseña va **pegada** al número de
comando, sin espacio.

| Qué hace | Comando | Ejemplo |
|---|---|---|
| APN | `803` + contraseña + espacio + APN | `8030000 internet.itelcel.com` |
| Servidor (IP y puerto) | `804` + contraseña + espacio + IP + espacio + puerto | `8040000 203.0.113.10 5013` |
| Leer la configuración actual | `RCONF` + contraseña | `RCONF0000` |

> ⚠️ **Este equipo suele aceptar solo IP, no dominio.** Es una limitación real
> de varios modelos H02 baratos, y choca con la recomendación de usar DDNS. Si
> tu modelo no acepta hostname, tendrás que reconfigurarlo cuando cambie tu IP
> pública. Compruébalo en tu manual antes de asumir cualquiera de las dos cosas.

**Verificar contra el manual del modelo:** el comando de intervalo de reporte y
el de reinicio, que varían mucho entre clones H02.

---

### GPS103 · Coban TK103 y familia

**Fuente:** manual de usuario Coban GPS103-A/B y TK103.
Contraseña por omisión: **`123456`**. **Todo en minúsculas**, sin comas.

| Qué hace | Comando | Ejemplo |
|---|---|---|
| Autorizar tu número (primero) | `begin` + contraseña | `begin123456` |
| APN | `apn` + contraseña + espacio + APN | `apn123456 internet.itelcel.com` |
| Usuario y contraseña del APN | `up` + contraseña + espacio + usuario + espacio + contraseña | `up123456 webgprs webgprs2002` |
| Servidor | `adminip` + contraseña + espacio + IP + espacio + puerto | `adminip123456 203.0.113.10 5001` |
| Reporte periódico | `fix` + intervalo + `***n` + contraseña | `fix030s***n123456` (cada 30 s) |
| Consultar estado | `check` + contraseña | `check123456` |
| Cambiar la contraseña | `password` + actual + espacio + nueva | `password123456 987654` |

El formato del intervalo es `fix<NNN><unidad>***n<contraseña>`, donde la unidad
es `s` segundos, `m` minutos u `h` horas. `fix030s***n123456` = cada 30 segundos.

> `begin123456` va **primero**: autoriza tu número como administrador. Sin eso,
> varios modelos ignoran los demás comandos en silencio.

---

### Teltonika · serie FMB

**Fuente:** [wiki oficial de Teltonika](https://wiki.teltonika-gps.com/view/FMB920_First_Start).
Formato completamente distinto: **un solo SMS** con todos los parámetros.

```
  setparam 2001:internet.itelcel.com;2002:webgprs;2003:webgprs2002;2004:rastreo.midominio.duckdns.org;2005:5027;2006:0
```

> 🚨 **Ese SMS empieza con DOS ESPACIOS.** No es un error de formato de este
> documento: la wiki de Teltonika lo especifica explícitamente. Son los campos
> vacíos de usuario y contraseña del equipo (que por omisión no tiene), y el
> comando **falla en silencio** si faltan.

| Parámetro | Qué es |
|---|---|
| `2001` | APN |
| `2002` | Usuario del APN (vacío si no aplica) |
| `2003` | Contraseña del APN (vacío si no aplica) |
| `2004` | Dominio o IP del servidor |
| `2005` | Puerto |
| `2006` | Protocolo: `0` = TCP, `1` = UDP |

Otros comandos útiles: `getinfo` (estado del equipo), `getparam 2004` (leer un
parámetro). La lista completa de parámetros de tu modelo está en la wiki de
Teltonika, en la página `<MODELO>_Parameter_list`.

Estos son equipos de gama industrial: valen bastante más que los anteriores y a
cambio son mucho más confiables y están mucho mejor documentados.

---

### Comandos de operación desde Traccar (sin SMS)

Una vez que el equipo ya está conectado, Traccar puede mandarle órdenes **por
GPRS**, sin costo de SMS, desde Configuración → Comandos. Estos son los que
Traccar genera, tomados de sus codificadores de protocolo:

| Protocolo | Apagar motor | Encender motor |
|---|---|---|
| `gt06` | `DYD,123456#` o `Relay,1#` según modelo | `HFYD,123456#` o `Relay,0#` |
| `gps103` | `**,imei:<IMEI>,J` | `**,imei:<IMEI>,K` |
| `h02` | `S20,1,1` | `S20,1,0` |
| `teltonika` | `setdigout 1` | `setdigout 0` |
| `meitrack` | `C01,0,12222` | `C01,0,02222` |

> ⚠️ **Corte de motor: úsalo con muchísimo cuidado.** Un vehículo en movimiento
> al que se le corta el motor es un accidente. La mayoría de los equipos serios
> solo ejecutan el corte por debajo de cierta velocidad, pero **no lo des por
> hecho**. Pruébalo únicamente con el vehículo estacionado.

---

## (e) APN de operadores mexicanos

| Operador | APN | Usuario | Contraseña |
|---|---|---|---|
| **Telcel** | `internet.itelcel.com` | `webgprs` | `webgprs2002` |
| **Movistar** | `internet.movistar.mx` | `movistar` | `movistar` |
| **AT&T México** | `internet.att.mx` | *(vacío)* | *(vacío)* |
| **Unefon** | `internet.att.mx` | *(vacío)* | *(vacío)* |
| **Bait** | `internet.itelcel.com` | `webgprs` | `webgprs2002` |

> Telcel también acepta `internet.itelcel.com` sin usuario ni contraseña en
> muchos equipos. Si con usuario no conecta, prueba sin él.

> **AT&T México:** ha usado varios APN a lo largo del tiempo
> (`internet.att.mx`, `modem.attmex.mx`, y el heredado
> `modem.nexteldata.com.mx` de Nextel). **Confírmalo con tu operador** antes de
> configurar los diez equipos. Los APN cambian y esta tabla envejece.

Bait y otros operadores virtuales usan la red de Telcel, así que suelen tomar su
mismo APN.

### Si tu SIM es de un proveedor M2M

Los SIM industriales (Emnify, Hologram, Twilio, 1NCE, KORE) traen **su propio
APN**, no el del operador que da la señal. Ejemplos: `em`, `hologram`, `iot.1nce.net`.

Está en el panel del proveedor. Ventajas reales para una flota: cobertura
multioperador, un solo panel para las diez líneas, y planes por megabyte que
salen mucho más baratos que diez planes de datos de consumo — un rastreador
reportando cada 30 segundos consume del orden de 10–30 MB al mes.

Muchos SIM M2M **no tienen número telefónico para recibir SMS**, o cobran aparte
por ese servicio. Configúralos antes de instalarlos en el vehículo, o asegúrate
de tener el SMS habilitado.

---

## (f) La zona horaria en UTC 0

**El rastreador debe reportar en UTC 0.** No en hora del centro de México, no en
la hora local del equipo.

### Por qué

Traccar guarda todo en UTC y convierte a la zona del usuario al mostrarlo. Si el
equipo manda hora local, Traccar la interpreta como UTC y **todo se corre**:

- Los viajes aparecen 6 horas antes o después de cuando ocurrieron.
- Los reportes por día salen partidos entre dos días.
- Las posiciones pueden caer fuera del rango que pediste y "desaparecer".
- Con un desfase hacia el futuro, el filtro `filter.future` de
  [`infra/traccar.xml`](../infra/traccar.xml) **descarta las posiciones** y el
  vehículo parece no reportar nunca.

Este último es especialmente traicionero: el equipo funciona, los paquetes
llegan, Traccar los decodifica bien, y aun así el mapa está vacío.

### Cómo comprobarlo

Compara `deviceTime` con `serverTime` en una posición recién llegada. Deben
diferir en segundos, no en horas:

```powershell
$token = (Get-Content .env | Select-String '^TRACCAR_API_TOKEN=').ToString().Split('=')[1]
Invoke-RestMethod "http://127.0.0.1:8082/api/positions" `
  -Headers @{ Authorization = "Bearer $token" } |
  Select-Object deviceId, deviceTime, serverTime | Format-Table
```

Si `deviceTime` va exactamente 6 horas atrás de `serverTime`, el equipo está en
hora del centro de México y hay que ponerlo en UTC 0.

### Cómo corregirlo

Varía por familia — **verificar contra el manual del modelo**. En muchos equipos
la zona horaria es un comando SMS con desplazamiento en horas (por ejemplo
`GMT,E,0,0#` en algunos GT06, o `time zone` + contraseña + `0` en algunos
Coban). En Teltonika la hora viene del GPS y ya es UTC, así que no hay nada que
hacer.

Si el equipo no permite cambiar la zona horaria, Traccar tiene un rodeo: en
Configuración → Dispositivos → tu unidad → Atributos, agrega `timezone` con el
desplazamiento en segundos (`-21600` para el centro de México).

---

## (g) Probar sin tocar mis rastreadores

**Empieza por aquí.** Las tres formas de validar que tu servidor funciona sin
arriesgar ni un equipo instalado.

### 1. El simulador de flota ⭐ lo más cómodo

```powershell
pnpm simulate --units 10 --city cdmx
```

Diez vehículos recorriendo rutas reales de la Ciudad de México. No necesita
hardware, ni SIM, ni internet más allá de los mapas. Detalles en
[`01-instalacion-local.md`](01-instalacion-local.md#6-arrancar-el-simulador).

### 2. La app Traccar Client en tu celular

Es lo más parecido a un rastreador real, porque implica una red de verdad.

1. Instala **Traccar Client** (Android o iOS).
2. Abre el firewall de Windows para el 5055 y averigua tu IP local — ambas cosas
   están en
   [`01-instalacion-local.md`](01-instalacion-local.md#71-abrir-el-firewall-para-probar-con-tu-celular).
3. Da de alta la unidad en Traccar con el identificador que pongas en la app.
4. Configura la app:

   | Campo | Valor |
   |---|---|
   | Dirección del servidor | `http://192.168.1.87:5055` ← **tu** IP |
   | Identificador | el que diste de alta, ej. `CELULAR01` |
   | Frecuencia | 30 s |

5. Activa el servicio y camina un poco. Debería aparecer moviéndose.

Si funciona el celular pero no un rastreador real, el problema **no es tu
servidor**: es la configuración del equipo o su acceso a internet.

### 3. Inyección manual con curl

Para probar un punto exacto. Da de alta `PRUEBA001` primero.

```powershell
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Invoke-RestMethod "http://localhost:5055/?id=PRUEBA001&lat=19.4326&lon=-99.1332&timestamp=$ts&speed=0&bearing=0"
```

Respuesta esperada: HTTP 200 y nada más. Si da **400**, casi siempre es que esa
unidad no está dada de alta.

> `speed` va en **nudos**, no en km/h. Traccar guarda todas las velocidades en
> nudos. Para convertir: **km/h ÷ 1.852 = nudos**.

---

## (h) Que un rastreador real llegue a mi máquina

Aquí está la dificultad de fondo del autoalojamiento, y conviene entenderla
antes de gastar tiempo.

### El problema

Tu rastreador tiene un SIM y sale **a internet**. Tu PC está detrás del router,
con una dirección privada (`192.168.x.x`) que **no existe desde fuera de tu
casa**. El rastreador no puede alcanzarla, por mucho que la escribas bien.

```
[Rastreador] ──► Internet ──► ??? ──✗── [192.168.1.87  tu PC]
                                          dirección privada,
                                          inalcanzable desde fuera
```

Esto es distinto del celular con Traccar Client: ese está **en tu misma red
local**, así que sí llega.

### 🚨 Cloudflare Tunnel y Tailscale NO sirven para esto

Es el error que más tiempo hace perder, porque son justo las herramientas que
recomienda internet para "exponer un servicio local".

**Por qué no funcionan aquí:**

- **Cloudflare Tunnel** solo transporta **HTTP y HTTPS**. Un rastreador GT06 no
  habla HTTP: abre un **socket TCP crudo** y manda bytes binarios. Cloudflare no
  tiene por dónde meterlos. *(La única excepción parcial es el protocolo OsmAnd
  del puerto 5055, que sí es HTTP — pero ningún rastreador de los que tienes lo
  usa.)*
- **Tailscale y WireGuard** son VPN: exigen instalar un cliente **en el
  dispositivo**. Un rastreador de $400 pesos no ejecuta software de terceros.

No hay forma de rodearlo. El tráfico tiene que llegar por TCP directo.

### Las opciones que sí funcionan

| Opción | Cuándo usarla | Contras |
|---|---|---|
| **Port forwarding temporal** | Prueba puntual, tú vigilando | Expone un puerto de tu casa. Requiere IP pública. |
| **VPS con relay TCP** | Estás detrás de CGNAT | ~$100 MXN/mes. Más piezas. |
| **Esperar a producción** ⭐ | **Lo recomendado** | Ninguno: es el orden correcto |

**La recomendación es la tercera.** Valida todo con el simulador y con Traccar
Client, y conecta los rastreadores reales cuando el servidor esté en su lugar
definitivo (Raspberry Pi o VPS) con DDNS. Así configuras cada equipo **una sola
vez** en lugar de dos.

Si aun así quieres probar ahora con port forwarding:

1. Comprueba que tienes **IP pública** (no CGNAT):
   ```powershell
   (Invoke-RestMethod https://api.ipify.org?format=json).ip
   ```
   Compárala con la IP WAN del panel de tu router. Si no coinciden, o la del
   router empieza con `100.64.`–`100.127.` o `10.`, estás detrás de CGNAT y el
   port forwarding **no va a funcionar**. Puedes pedirle IP pública a tu
   proveedor; en México Telmex suele darla, Totalplay a menudo no.
2. En el router, reenvía el puerto del protocolo (ej. 5023) a la IP local de tu
   PC. **Reserva esa IP por MAC**, o dejará de funcionar al reiniciar el router.
3. Abre el firewall de Windows para ese puerto.
4. **Ciérralo todo cuando termines la prueba.**

---

## (i) Migrar desde Ruhavik

### La advertencia que define todo el plan

> 🚨 **La mayoría de los rastreadores baratos apuntan a un solo servidor a la
> vez.** En cuanto reapuntes un equipo a tu servidor, **desaparece de Ruhavik**.
> No hay periodo de convivencia.

Por eso la migración va **por lotes**, nunca de golpe.

### Antes de mover nada: exporta tu historial

Cuando dejes de pagar, esos datos se van. Ruhavik permite exportar:

- **Recorridos:** `.kml`, `.gpx`, `.geojson`, `.wln`
- **Eventos y línea de tiempo:** `.xlsx`, `.csv`, `.pdf`

Descarga **todo el historial de las diez unidades** antes de empezar. Guárdalo
fuera del repositorio: contiene ubicaciones reales de vehículos reales.

Anota también, para cada unidad: **IMEI, modelo del equipo, número del SIM,
operador y APN**. Esa es la tabla de inventario del final de este documento.

### Plan por lotes

**Lote 0 — Preparación (sin tocar ningún equipo)**

1. Servidor en su ubicación definitiva, con DDNS funcionando.
2. Historial de Ruhavik exportado y guardado.
3. Inventario lleno.
4. Las 10 unidades **dadas de alta en Traccar** con sus IMEI reales.
5. Puertos de protocolo abiertos en el router y en el firewall.

**Lote 1 — Una sola unidad de prueba (3 a 7 días)**

Elige el vehículo **menos crítico** y que puedas dejar **estacionado en casa**.

1. Manda los comandos SMS: APN → servidor → reinicio.
2. Verifica en los logs que llega y se decodifica.
3. Déjalo reportando varios días. Mira que:
   - No haya huecos ni desconexiones cíclicas.
   - Las horas cuadren (sección (f)).
   - El odómetro avance al moverse.
   - Los viajes se detecten bien.
4. **No canceles Ruhavik todavía.**

**Lote 2 — Dos o tres unidades más (3 a 5 días)**

Confirma que el servidor aguanta varias unidades a la vez y que puedes
distinguirlas bien en tu mapa.

**Lote 3 — El resto**

De dos en dos, verificando cada una antes de seguir.

**Cierre**

Solo cuando las diez lleven **al menos una semana** reportando sin fallas,
cancela la suscripción de Ruhavik.

### Plan de reversa

Si algo sale mal, el camino de vuelta es mandar de nuevo los comandos SMS
apuntando al servidor de Ruhavik. **Para eso necesitas haber anotado ANTES la
dirección y el puerto que usaba cada equipo.**

Anótalos en el inventario antes de tocar el primer equipo. Sin ese dato, volver
atrás significa buscar en la documentación de Ruhavik bajo presión, con un
vehículo sin monitoreo.

Ten a la mano, para cada unidad:

- Servidor y puerto originales de Ruhavik
- Contraseña del equipo (si la cambiaste, la nueva)
- Número telefónico del SIM
- La secuencia exacta de comandos que funcionó

---

## (j) Solución de problemas

Formato: **síntoma → causas probables → cómo verificarlo**.

### No llega absolutamente nada

El log de Traccar no muestra ninguna conexión de esa IP.

| Causa probable | Cómo verificarlo |
|---|---|
| El SIM no tiene saldo o datos | Métele el SIM a un celular y navega |
| APN mal configurado | Pide el estado al equipo (`check123456`, `RCONF0000`, `getinfo`) |
| Dirección o puerto mal en el equipo | Lee la config del equipo por SMS y compárala |
| Puerto no reenviado en el router | <https://www.yougetsignal.com/tools/open-ports/> con tu IP pública |
| Firewall de Windows bloqueando | `Get-NetFirewallRule -DisplayName "*5023*"` |
| **Estás detrás de CGNAT** | Compara tu IP pública con la WAN del router (sección (h)) |
| Sin cobertura donde está el vehículo | Mueve el vehículo y observa |
| **Pusiste el puerto 8082** | Ese es el de la web. Debe ser 5023, 5013, 5001… |

Empieza siempre por: *¿funciona el celular con Traccar Client?* Si sí, tu
servidor está bien y el problema es del equipo o de su red.

### Llega pero Traccar no lo decodifica

| Causa probable | Cómo verificarlo |
|---|---|
| Puerto equivocado para ese protocolo | Compara el paquete crudo con la tabla de firmas de (a) |
| Protocolo mal identificado | Sección (a), métodos 2 y 4 |
| Firmware raro de un clon | Busca el paquete crudo en el foro de Traccar |

```powershell
pnpm infra:logs | Select-String "Unknown message|error"
```

### Se conecta y se desconecta en ciclo

```
INFO: [Txxx] connected
INFO: [Txxx] disconnected
INFO: [Txxx] connected     <- cada pocos segundos
```

| Causa probable | Cómo verificarlo |
|---|---|
| Traccar no manda el ACK que el equipo espera | Busca líneas con `>` en el log; si no hay, no está respondiendo |
| Puerto equivocado (conecta pero no se entienden) | Verifica el protocolo |
| Señal GSM muy débil | Consulta el estado del equipo; mueve el vehículo |
| Alimentación intermitente | Revisa el cableado; ¿coincide con arrancar el motor? |

### Posiciones con fecha u hora incorrecta

Ver la sección [(f)](#f-la-zona-horaria-en-utc-0). Es casi siempre zona horaria.

Si las posiciones **no aparecen en absoluto** pero el log dice que llegan,
sospecha del filtro `filter.future`: un equipo con la hora adelantada hace que
Traccar descarte todo en silencio.

### Posiciones en el mar cerca de África (coordenadas 0,0)

El equipo reporta **antes de conseguir señal de GPS** y manda ceros. Latitud 0,
longitud 0 cae en el golfo de Guinea, frente a África.

Este proyecto ya lo filtra: `filter.zero` está en `true` en
[`infra/traccar.xml`](../infra/traccar.xml). Si las ves de todas formas:

| Causa probable | Cómo verificarlo |
|---|---|
| `filter.zero` apagado | Revísalo en `infra/traccar.xml` |
| Antena GPS tapada o mal instalada | Debe ver el cielo; el metal la bloquea |
| Vehículo en estacionamiento subterráneo | Sácalo y espera 2–5 minutos |
| Primer arranque del equipo | La primera fijación puede tardar varios minutos |

### El equipo reporta pero el odómetro no avanza

Traccar calcula `totalDistance` acumulando la distancia entre posiciones
consecutivas.

| Causa probable | Cómo verificarlo |
|---|---|
| Intervalo demasiado largo | Con reportes cada 5 min se pierden las curvas y la distancia sale corta. Baja a 30–60 s |
| Posiciones marcadas como inválidas | `filter.invalid` las descarta; revisa el log |
| El equipo manda su propio odómetro en cero | Consulta `attributes` de la posición |
| Odómetro reiniciado a mano | Configuración → Dispositivos → Acumuladores |

Consulta el valor actual:

```powershell
$token = (Get-Content .env | Select-String '^TRACCAR_API_TOKEN=').ToString().Split('=')[1]
Invoke-RestMethod "http://127.0.0.1:8082/api/positions" -Headers @{ Authorization = "Bearer $token" } |
  ForEach-Object { [PSCustomObject]@{ id = $_.deviceId; km = [math]::Round($_.attributes.totalDistance / 1000, 1) } }
```

### Una unidad de las diez deja de reportar y las demás siguen bien

Este es el más fácil de diagnosticar, justo porque las otras nueve funcionan:
**el servidor, la red y la configuración general están descartados**. El problema
es de esa unidad.

| Causa probable | Cómo verificarlo |
|---|---|
| SIM sin saldo o sin datos | Panel del operador; es la causa número uno |
| Fusible o cableado suelto | ¿Coincide con un servicio en el taller? |
| Vehículo en zona sin cobertura | ¿Dónde fue su última posición conocida? |
| Equipo desconectado a propósito | Compara con el registro de uso del vehículo |
| Batería de respaldo agotada | Consulta el estado por SMS |

```powershell
# Cuánto lleva sin reportar cada unidad
Invoke-RestMethod http://localhost:3000/api/units |
  Select-Object -ExpandProperty units |
  Select-Object name, state, @{n='ultimoReporte';e={$_.position.fixTime}} |
  Sort-Object ultimoReporte
```

---

## (k) Checklist para dar de alta un rastreador

Pensado para repetirlo diez veces sin equivocarse. Imprímelo o cópialo por cada
unidad.

**Antes de tocar el equipo**

- [ ] IMEI anotado (15 dígitos, verificado dos veces)
- [ ] Modelo y protocolo identificados (sección (a))
- [ ] Puerto correspondiente anotado (sección (b))
- [ ] Ese puerto publicado en `infra/docker-compose.yml`
- [ ] Ese puerto abierto en el router y en el firewall
- [ ] Número telefónico del SIM anotado
- [ ] APN del operador anotado (sección (e))
- [ ] **Servidor y puerto ORIGINALES de Ruhavik anotados** (para el plan de reversa)
- [ ] Contraseña del equipo anotada
- [ ] Historial de esa unidad exportado de Ruhavik

**Dar de alta en Traccar**

- [ ] Unidad creada en Configuración → Dispositivos → +
- [ ] Identificador = IMEI exacto
- [ ] Nombre reconocible (ej. "Nissan NP300 · Reparto 1")
- [ ] Categoría de vehículo elegida

**Configurar el equipo por SMS** *(vehículo estacionado)*

- [ ] Sintaxis verificada **contra el manual del modelo exacto**
- [ ] 1 · APN — respuesta recibida ✅
- [ ] 2 · Servidor (**hostname DDNS**, puerto de protocolo) — respuesta ✅
- [ ] 3 · Intervalo de reporte (30–60 s) — respuesta ✅
- [ ] 4 · Reinicio — respuesta ✅

**Verificar**

- [ ] `pnpm infra:logs` muestra la conexión de esa unidad
- [ ] Se decodifica: hay líneas `<` **y** `>` (Traccar responde)
- [ ] Aparece en el mapa de tu frontend
- [ ] `deviceTime` y `serverTime` difieren en segundos, no en horas
- [ ] Las coordenadas son plausibles (no 0,0)
- [ ] Al mover el vehículo, la posición se actualiza
- [ ] El odómetro avanza
- [ ] 24 horas sin desconexiones cíclicas

**Cerrar**

- [ ] Inventario actualizado
- [ ] `logger.level` de vuelta en `info`
- [ ] Comandos que funcionaron anotados (para la siguiente unidad)

---

## Inventario de mis unidades

> 🚨 **No subas esta tabla llena al repositorio público.** Los IMEI identifican
> hardware concreto y los números de SIM son datos personales. Llénala en una
> copia local, o mueve el archivo a uno que esté en `.gitignore`.

| # | Vehículo | Marca/modelo | IMEI | Protocolo | Puerto | SIM / Operador | APN | Servidor Ruhavik (reversa) | Estado |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | ⬜ pendiente |
| 2 | | | | | | | | | ⬜ pendiente |
| 3 | | | | | | | | | ⬜ pendiente |
| 4 | | | | | | | | | ⬜ pendiente |
| 5 | | | | | | | | | ⬜ pendiente |
| 6 | | | | | | | | | ⬜ pendiente |
| 7 | | | | | | | | | ⬜ pendiente |
| 8 | | | | | | | | | ⬜ pendiente |
| 9 | | | | | | | | | ⬜ pendiente |
| 10 | | | | | | | | | ⬜ pendiente |

**Estados:** ⬜ pendiente · 🔵 identificado · 🟡 configurado, en prueba ·
🟢 reportando estable · 🔴 con problema

---

## Fuentes

- [Identificación de protocolos — Traccar](https://www.traccar.org/identify-protocol/)
- [Dispositivos soportados — Traccar](https://www.traccar.org/devices/)
- [Archivo de configuración — Traccar](https://www.traccar.org/configuration-file/)
- [Foro de Traccar](https://www.traccar.org/forums/)
- [`PortConfigSuffix.java`](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/config/PortConfigSuffix.java) — puertos por omisión
- [Wiki de Teltonika — FMB920 First Start](https://wiki.teltonika-gps.com/view/FMB920_First_Start)
- [Manual SinoTrack ST-901](https://manuals.plus/sinotrack/st-901-gps-tracker-manual)
- Manuales de usuario Concox GT06N y Coban GPS103-A/B
