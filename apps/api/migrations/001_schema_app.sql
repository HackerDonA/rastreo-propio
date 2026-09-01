-- ============================================================================
--  001 · Esquema `app` y módulo de mantenimientos
-- ============================================================================
--  Todo lo nuestro vive en el esquema `app`, separado del `public` donde
--  Traccar administra sus 49 tablas tc_*. Nosotros LEEMOS las tc_*, nunca las
--  escribimos. Ver docs/adr/0004-schema-app-separado.md.
--
--  Sin claves foráneas hacia `public`, a propósito:
--    · Una FK hacia un esquema que no controlamos se rompe cuando Traccar
--      cambia esa tabla en una actualización.
--    · tc_devices tiene ON DELETE CASCADE hacia tc_positions. No queremos que
--      borrar una unidad en Traccar arrastre en silencio su historial de
--      servicios, que es justo el dato que conviene conservar aunque el
--      vehículo salga de la flota.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- ----------------------------------------------------------------------------
--  Plantillas: la regla en abstracto, aplicable a muchas unidades
-- ----------------------------------------------------------------------------
--  "Cambio de aceite cada 5,000 km" se define UNA vez y se aplica a la flota
--  entera. Capturar eso diez veces, una por vehículo, es justo lo que hace
--  inservible un módulo de mantenimientos.
-- ----------------------------------------------------------------------------
CREATE TABLE app.maintenance_templates (
    id                      serial PRIMARY KEY,
    name                    text NOT NULL,
    description             text,

    -- Las tres dimensiones. Se puede configurar una, dos o las tres a la vez;
    -- cuando hay varias, gana la que se cumpla primero.
    interval_km             numeric(12, 2),
    interval_days           integer,
    interval_engine_hours   numeric(12, 2),

    -- Aviso previo: cuánto antes avisar. Con interval_km = 5000 y
    -- notice_km = 500, el aviso salta a los 4,500 km.
    notice_km               numeric(12, 2),
    notice_days             integer,
    notice_engine_hours     numeric(12, 2),

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    -- Una plantilla sin ningún intervalo nunca vencería: no tiene sentido.
    CONSTRAINT template_has_interval CHECK (
        interval_km IS NOT NULL
        OR interval_days IS NOT NULL
        OR interval_engine_hours IS NOT NULL
    ),
    CONSTRAINT template_intervals_positive CHECK (
        (interval_km IS NULL OR interval_km > 0)
        AND (interval_days IS NULL OR interval_days > 0)
        AND (interval_engine_hours IS NULL OR interval_engine_hours > 0)
    )
);

-- ----------------------------------------------------------------------------
--  Reglas: una plantilla aplicada a una unidad concreta
-- ----------------------------------------------------------------------------
CREATE TABLE app.maintenance_rules (
    id                      serial PRIMARY KEY,

    -- De qué plantilla salió. ON DELETE SET NULL: borrar la plantilla no debe
    -- borrar el seguimiento de diez vehículos; la regla sigue viva por su
    -- cuenta con los valores que ya tiene copiados.
    template_id             integer REFERENCES app.maintenance_templates(id) ON DELETE SET NULL,

    -- tc_devices.id. SIN clave foránea: ver la nota del encabezado.
    device_id               integer NOT NULL,

    name                    text NOT NULL,

    -- Copiados de la plantilla al aplicarla, y editables por unidad. Así un
    -- vehículo puede tener un intervalo distinto sin romper la plantilla.
    interval_km             numeric(12, 2),
    interval_days           integer,
    interval_engine_hours   numeric(12, 2),
    notice_km               numeric(12, 2),
    notice_days             integer,
    notice_engine_hours     numeric(12, 2),

    -- Línea base: desde dónde se cuenta el próximo servicio. Registrar un
    -- servicio en maintenance_history mueve estos tres valores.
    baseline_km             numeric(12, 2),
    baseline_at             timestamptz NOT NULL DEFAULT now(),
    baseline_engine_hours   numeric(12, 2),

    active                  boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT rule_has_interval CHECK (
        interval_km IS NOT NULL
        OR interval_days IS NOT NULL
        OR interval_engine_hours IS NOT NULL
    )
);

-- Consulta principal: "todas las reglas activas de esta unidad".
CREATE INDEX maintenance_rules_device_idx
    ON app.maintenance_rules (device_id) WHERE active;

-- Aplicar una plantilla a la flota debe ser idempotente: correrlo dos veces no
-- debe dejar la unidad con dos reglas iguales compitiendo entre sí.
CREATE UNIQUE INDEX maintenance_rules_device_template_uniq
    ON app.maintenance_rules (device_id, template_id)
    WHERE template_id IS NOT NULL AND active;

-- ----------------------------------------------------------------------------
--  Historial de servicios
-- ----------------------------------------------------------------------------
--  Cada fila es un servicio realizado. Registrar uno reinicia la línea base de
--  su regla, y con eso el contador vuelve a empezar.
-- ----------------------------------------------------------------------------
CREATE TABLE app.maintenance_history (
    id              serial PRIMARY KEY,
    rule_id         integer NOT NULL REFERENCES app.maintenance_rules(id) ON DELETE CASCADE,
    device_id       integer NOT NULL,

    performed_at    timestamptz NOT NULL,
    -- Lecturas al momento del servicio. Se guardan aunque se puedan recalcular:
    -- el odómetro de Traccar se puede reiniciar a mano, y entonces el histórico
    -- dejaría de cuadrar.
    odometer_km     numeric(12, 2),
    engine_hours    numeric(12, 2),

    cost            numeric(12, 2),
    vendor          text,
    notes           text,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_history_rule_idx
    ON app.maintenance_history (rule_id, performed_at DESC);
CREATE INDEX maintenance_history_device_idx
    ON app.maintenance_history (device_id, performed_at DESC);

-- ----------------------------------------------------------------------------
--  Avisos
-- ----------------------------------------------------------------------------
--  Los escribe el job horario. Un aviso abierto se cierra solo cuando se
--  registra el servicio o cuando la regla deja de estar vencida.
-- ----------------------------------------------------------------------------
CREATE TABLE app.alerts (
    id              serial PRIMARY KEY,
    rule_id         integer NOT NULL REFERENCES app.maintenance_rules(id) ON DELETE CASCADE,
    device_id       integer NOT NULL,

    -- due_soon = dentro del aviso previo; overdue = ya se pasó.
    level           text NOT NULL CHECK (level IN ('due_soon', 'overdue')),
    -- Cuál de las tres dimensiones disparó el aviso.
    trigger_kind    text NOT NULL CHECK (trigger_kind IN ('km', 'date', 'hours')),

    remaining_km    numeric(12, 2),
    remaining_days  numeric(12, 2),
    remaining_hours numeric(12, 2),

    message         text NOT NULL,
    opened_at       timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz
);

-- Como mucho UN aviso abierto por regla. Sin esto, el job crearía uno nuevo
-- cada hora y en una semana habría 168 avisos del mismo cambio de aceite.
CREATE UNIQUE INDEX alerts_one_open_per_rule
    ON app.alerts (rule_id) WHERE closed_at IS NULL;

CREATE INDEX alerts_open_idx
    ON app.alerts (device_id) WHERE closed_at IS NULL;
