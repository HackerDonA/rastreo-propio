# ADR 0001 · Usar Traccar como motor de ingesta, no escribir el servidor de protocolos

- **Fecha:** 2026-08-31
- **Estado:** Aceptada

## Contexto

El proyecto sustituye a Ruhavik (GPS-Trace/Gurtam) para monitorear una flota de
10 vehículos. Los rastreadores son equipos con SIM que abren un **socket TCP
crudo** contra un servidor y hablan protocolos binarios propietarios: GT06, H02,
GPS103, Teltonika, y decenas más. La mayoría no tiene documentación pública.

Hay dos caminos: escribir el servidor que recibe y decodifica esos protocolos, o
usar uno existente y construir encima.

## Decisión

Usar **Traccar 6.15.3** (Apache 2.0) como motor de ingesta, decodificación y
almacenamiento. Encima construimos nuestra propia API y nuestro propio frontend.

**No** se implementa ningún decodificador de protocolo en este repositorio.

## Motivos

**El trabajo es enorme y no es el trabajo interesante.** Traccar soporta **268
protocolos** (contados en `PortConfigSuffix.java`) y más de 2000 modelos. Cada uno
es un formato binario distinto, casi siempre sin especificación oficial, deducido
a base de leer paquetes crudos. Implementar bien *uno solo* son semanas.

**No sabemos aún qué equipos tenemos.** Los 10 rastreadores actuales podrían ser
de marcas distintas. Con Traccar eso es una línea de configuración; con un
servidor propio, cada marca nueva es un proyecto nuevo.

**Es el mismo tipo de motor que hay detrás de Ruhavik.** No estamos bajando de
categoría: estamos quitando la mensualidad y la caja negra.

**El valor de este proyecto está en otra capa.** Lo que Ruhavik no nos deja hacer
es el módulo de mantenimientos con nuestras reglas y un frontend a nuestro gusto.
Ahí es donde conviene gastar el tiempo.

**Licencia y operación.** Apache 2.0, sin límite de unidades, sin telemetría
obligatoria (la desactivamos con `server.statistics` vacío), y corre en una
Raspberry Pi.

## Qué nos da Traccar, ya resuelto

- Recepción TCP/UDP y decodificación de 268 protocolos
- Esquema de base de datos estable (49 tablas `tc_*`) con migraciones Liquibase
- Geocercas, detección de viajes y paradas, eventos
- Comandos remotos hacia los equipos
- API REST documentada con OpenAPI + WebSocket de posiciones en vivo

## Qué construimos nosotros

- Módulo de mantenimientos por kilometraje, fecha y horas motor
- Frontend propio con mapa, panel de flota y reportes
- API que agrega y adapta los datos para ese frontend

## Consecuencias

**A favor**

- La Fase 1 se completa en horas, no en meses.
- Agregar un modelo de rastreador nuevo casi nunca requiere escribir código.
- El esquema `tc_*` está probado por miles de instalaciones.

**En contra**

- Dependemos de un proyecto externo. Se mitiga fijando la versión exacta de la
  imagen (`6.15.3-alpine`, nunca `:latest`) y respaldando antes de actualizar.
- Nos atamos a su modelo de datos. Por eso nuestras tablas viven en un esquema
  aparte — ver [ADR 0004](0004-schema-app-separado.md).
- Hay que aprender su configuración y sus rarezas. Ya nos costó dos: los puertos
  ya no están en `conf/default.xml` sino compilados en `PortConfigSuffix.java`, y
  `database.historyDays` fue eliminado. Ambas quedaron documentadas.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Servidor de protocolos propio** | Meses de trabajo por familia de protocolo, sin especificaciones oficiales, y no acerca al objetivo real. Sigue siendo un ejercicio interesante para *un* modelo concreto, pero como camino principal es el largo. |
| **OpenGTS** | Proyecto con mucho menos movimiento, interfaz anticuada y menos protocolos. |
| **Wialon / Navixy** | De pago. Es exactamente lo que estamos dejando. |
| **Seguir en Ruhavik** | Es el problema, no la solución: mensualidad, sin módulo de mantenimientos a nuestra medida, sin control de los datos. |
