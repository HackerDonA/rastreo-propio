# 03 · Arquitectura

> 🚧 **En construcción — se completa durante las Fases 2 y 4.**
>
> El diagrama general del flujo de datos ya está en el
> [README](../README.md#arquitectura). Aquí se documentará el detalle.

## Qué va a cubrir

- Diagrama Mermaid del flujo completo, con el detalle de cada salto
- Modelo de datos del esquema `app` (mantenimientos, historial, avisos)
- Diseño del relay de WebSocket y por qué agrupa las emisiones
- Estrategia de simplificación de rutas para el historial
- Volumen de datos esperado y cuándo tocaría particionar

## Ya decidido

Las decisiones de fondo están en los ADRs:

- [0001 · Traccar como motor](adr/0001-motor-traccar.md)
- [0002 · BFF propio](adr/0002-bff-propio.md)
- [0003 · MapLibre + OpenFreeMap](adr/0003-maplibre-openfreemap.md)
- [0004 · Esquema `app` separado](adr/0004-schema-app-separado.md)

## Volumen de datos esperado

Con **10 unidades reportando cada 15 segundos**:

| Periodo | Filas en `tc_positions` |
|---|---|
| Por unidad, por día | 5,760 |
| Flota, por día | 57,600 |
| Flota, por mes | **~1.7 millones** |
| Flota, por año | ~21 millones (≈ 6–8 GB con atributos e índices) |

PostgreSQL maneja eso sin esfuerzo. Traccar ya crea el índice
`position_deviceid_fixtime` sobre `tc_positions`
([`changelog-4.7.xml`](https://github.com/traccar/traccar/blob/master/schema/changelog-4.7.xml)),
que es justo el que necesitan las consultas de historial — por eso este proyecto
**no agrega ningún índice** a las tablas `tc_*`.

**Cuándo preocuparse:** cuando ocurra lo primero de

- ~50–100 millones de filas en `tc_positions`, o
- una consulta de historial de un mes tarde más de ~1 segundo.

Con 10 unidades eso son entre 2 y 4 años de operación. En ese punto hay dos
caminos: particionar `tc_positions` por mes, o migrar a TimescaleDB (Traccar
publica un `docker-compose` de ejemplo para eso).

> **Nota sobre retención:** `database.historyDays` **ya no existe** en Traccar
> 6.15 — fue eliminado y hoy el servidor no tiene ninguna opción de retención
> automática. La estrategia de este proyecto es no almacenar basura (los filtros
> de [`infra/traccar.xml`](../infra/traccar.xml)) más una purga manual opcional.
