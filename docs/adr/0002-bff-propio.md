# ADR 0002 · Un BFF propio entre el frontend y Traccar

- **Fecha:** 2026-08-31
- **Estado:** Aceptada

## Contexto

Traccar ya expone una API REST completa y un WebSocket de posiciones en vivo. El
frontend podría hablar directo con ellos y ahorrarnos una capa entera.

## Decisión

El frontend **nunca** habla con Traccar. Todo pasa por un BFF (*Backend For
Frontend*) propio en Fastify + TypeScript, que es el único que conoce el token de
Traccar.

```
Navegador  ──►  BFF (Fastify)  ──►  Traccar REST + WebSocket
                     │
                     └──────────►  PostgreSQL (esquema app, y lectura de tc_*)
```

## Motivos

### 1. El token de Traccar no puede llegar al navegador

Un token de Traccar da **control total** sobre todas las unidades: leer
posiciones, mandar comandos remotos al vehículo, borrar historial. Si el frontend
lo tuviera, estaría en el bundle de JavaScript, visible para cualquiera que abra
las herramientas de desarrollo.

El BFF lo guarda en el servidor y expone hacia afuera solo lo que necesita el
frontend.

### 2. El WebSocket de Traccar no acepta autenticación por token

Esta es la razón técnica que zanja la discusión. La
[documentación oficial](https://www.traccar.org/traccar-api/) dice textual:

> *"Session cookie is the only authorization option for the WebSocket connection."*

Para abrir `/api/socket` hay que:

1. `GET /api/session?token=<token>` con el token de API
2. Quedarse con la cookie `JSESSIONID`
3. Abrir el WebSocket llevando esa cookie

Un frontend en el navegador **no puede hacer eso** contra otro origen: la cookie
es de Traccar, no del frontend, y la API de WebSocket del navegador no permite
poner encabezados a mano. El BFF sí puede, porque es un cliente HTTP normal.

*(Verificado contra Traccar 6.15.3: `GET /api/session?token=…` devuelve 200 y una
cookie `JSESSIONID` que después autentica las llamadas REST.)*

### 3. Una conexión aguas arriba, no N

Con 10 navegadores abiertos hablando directo con Traccar habría 10 WebSockets
contra el servidor. El BFF mantiene **uno solo** y reparte a todos los clientes.

Además puede **agrupar**: 10 unidades reportando cada segundo son 10 mensajes por
segundo por navegador. El relay los junta en un buffer y emite cada 750 ms, lo que
baja a ~1.3 mensajes por segundo sin perder información. Con 50 unidades esa
diferencia deja de ser cosmética.

### 4. Aquí vive la lógica que Traccar no tiene

El módulo de mantenimientos con reglas por kilometraje, fecha y horas motor —el
diferenciador del proyecto— no existe en Traccar de la forma que queremos.
Necesita un lugar propio con su propia base de datos.

### 5. Endpoints a la medida del frontend, no de Traccar

El frontend necesita "todas las unidades con su última posición y su estado". En
Traccar eso son dos llamadas (`/api/devices` y `/api/positions`) que hay que
cruzar. El BFF lo resuelve una vez y expone `GET /api/units`.

Lo mismo con el historial: un mes de una unidad son ~170 000 puntos, y la API de
Traccar además corta en `report.maxPositions` (50 000 por omisión). El BFF lee
directo de `tc_positions` y **simplifica la ruta** antes de mandarla, porque
dibujar 170 000 puntos en un mapa no aporta nada y tumba el navegador.

## Consecuencias

**A favor**

- El token nunca sale del servidor.
- El WebSocket en vivo es posible (sin BFF, sencillamente no lo es).
- Una sola conexión aguas arriba, con agrupamiento.
- Podemos cambiar cosas de Traccar sin tocar el frontend.

**En contra**

- Una capa más que mantener y desplegar.
- Latencia adicional de un salto (despreciable: ambos en la misma máquina).
- Hay que replicar tipos de la API de Traccar. Se mitiga generándolos desde su
  especificación OpenAPI y validando con Zod en la frontera.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Frontend directo a Traccar** | Expone el token y hace imposible el WebSocket en vivo. |
| **Proxy inverso a secas** (nginx/Caddy inyectando el token) | Resuelve el secreto, pero no da dónde poner los mantenimientos ni permite agregar, agrupar o simplificar rutas. |
| **Usar el frontend nativo de Traccar** | Es justo lo que queremos reemplazar: no tiene nuestro módulo de mantenimientos ni el diseño que buscamos. |
