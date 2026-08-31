# ADR 0004 · Nuestras tablas en un esquema `app` de la misma base de datos

- **Fecha:** 2026-08-31
- **Estado:** Aceptada

## Contexto

El módulo de mantenimientos necesita tablas propias: plantillas, reglas por
unidad, historial de servicios y avisos. Traccar administra su propio esquema —49
tablas `tc_*`— con migraciones Liquibase que se aplican solas en cada arranque.

La pregunta es dónde ponemos lo nuestro.

## Decisión

Nuestras tablas viven en un **esquema `app` dentro de la misma base de datos
PostgreSQL** que usa Traccar.

Reglas firmes:

1. **Nunca** se crea, altera ni borra nada en el esquema `public` (las `tc_*`).
2. Las tablas `tc_*` se leen, jamás se escriben.
3. **Sin claves foráneas cruzadas** entre `app` y `public`.
4. Nuestras migraciones son SQL versionado, independiente de Liquibase.

```
Base de datos: traccar
├── public   ← Traccar. 49 tablas tc_*. Solo lectura para nosotros.
└── app      ← Nuestro. Mantenimientos y avisos.
```

## Motivos

### Traccar debe poder actualizarse sin miedo

Cada arranque, Traccar corre Liquibase y aplica los change sets que le falten. Si
hubiéramos metido columnas o tablas dentro de su esquema, una actualización podría
chocar con ellas, o su migración podría borrarlas. Con esquemas separados,
`docker compose pull` deja de ser una apuesta.

### Una sola base: consultas cruzadas, respaldos y transacciones

Poner lo nuestro en **otra** base de datos habría impedido lo que más usamos:

```sql
-- Progreso de mantenimiento por unidad: cruza nuestras reglas con las
-- posiciones de Traccar en una sola consulta.
SELECT d.name, r.name AS regla,
       (p.attributes->>'totalDistance')::numeric / 1000 - r.baseline_km AS km_recorridos
FROM app.maintenance_rules r
JOIN tc_devices   d ON d.id = r.device_id
JOIN tc_positions p ON p.id = d.positionid;
```

Con dos bases eso serían dos consultas y un cruce en memoria. Además, un solo
`pg_dump` respalda todo de forma consistente, y nuestras escrituras pueden ser
transaccionales contra lecturas del mismo instante.

### Sin claves foráneas cruzadas, a propósito

`app.maintenance_rules.device_id` apunta a `tc_devices.id`, pero **no** con una
`FOREIGN KEY`. Motivos:

- Una `FK` hacia `public` sería una dependencia estructural sobre un esquema que
  no controlamos. Si Traccar cambia esa tabla, nuestra migración se rompe.
- `tc_devices` tiene `ON DELETE CASCADE` hacia `tc_positions`. No queremos que
  borrar una unidad en Traccar arrastre en silencio su historial de servicios: ese
  es justamente el dato que queremos conservar aunque el vehículo salga de la
  flota.

La integridad se valida en la capa de aplicación, donde podemos decidir qué hacer
con una regla huérfana en vez de perderla.

### El usuario de base de datos es el mismo

Traccar y nuestro BFF usan el mismo usuario de PostgreSQL. Es una simplificación
consciente para un despliegue personal de una sola máquina.

> **Mejora pendiente para producción:** crear un rol `app_bff` con `SELECT` sobre
> `public` y todos los permisos sobre `app`. Así el privilegio de escritura sobre
> `tc_*` deja de existir a nivel de base de datos, y la regla "solo lectura" la
> impone PostgreSQL en vez de nuestra disciplina.

### Sobre los índices

Traccar **ya crea** `position_deviceid_fixtime` sobre `tc_positions`
(`schema/changelog-4.7.xml`) y `event_deviceid_servertime` sobre `tc_events`
(`changelog-4.9.xml`). Son exactamente los que necesitan nuestras consultas de
historial, así que **no agregamos ni un índice a las tablas `tc_*`** — cosa que,
además, habría violado la regla 1. Nuestros índices van solo en `app`.

## Consecuencias

**A favor**

- Actualizar Traccar es seguro.
- Consultas que cruzan ambos mundos, en SQL, sin trabajo en memoria.
- Un respaldo, un restore, un punto de recuperación.
- La separación se ve a simple vista en cualquier cliente de base de datos.

**En contra**

- Nada impide técnicamente escribir en `tc_*`: la regla la sostiene la disciplina
  y las revisiones de código, hasta que se implemente el rol separado.
- Si algún día quisiéramos escalar Traccar y el BFF a máquinas distintas,
  comparten base. No es un escenario previsto para 10 unidades.
- Hay que administrar nuestras migraciones aparte, sin Liquibase.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Tablas dentro del esquema `public`, junto a las `tc_*`** | Riesgo real de choque en cada actualización de Traccar, y se pierde la separación visual entre lo suyo y lo nuestro. |
| **Base de datos aparte** | Imposibilita las consultas cruzadas, que es justo lo que hace el módulo de mantenimientos. Dos respaldos, dos restauraciones, dos oportunidades de quedar inconsistentes. |
| **Agregar columnas a `tc_devices`** | Es modificar el esquema de Traccar. Se rompe en la primera actualización. |
| **Usar `attributes` de Traccar como almacén** | Traccar permite atributos JSON arbitrarios en dispositivos. Serviría para un dato suelto, pero no para tablas con historial, consultas y relaciones. Y sería escribir en `tc_*`. |
