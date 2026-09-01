-- ============================================================================
--  003 · Enlaces para compartir la ubicación de una unidad
-- ============================================================================
--  Permite mandarle a alguien un enlace para que vea dónde va un vehículo, sin
--  darle cuenta ni acceso a nada más. El caso típico: un cliente que pregunta
--  "¿dónde viene mi entrega?".
--
--  DECISIONES DE SEGURIDAD QUE ESTÁN EN EL ESQUEMA
--  -----------------------------------------------
--  1. TODO ENLACE CADUCA. `expires_at` es NOT NULL a propósito. Un enlace
--     público y permanente a la ubicación en vivo de un vehículo es una
--     herramienta de seguimiento de personas: quien lo reciba una vez puede
--     saber por dónde anda el conductor para siempre. Si la base no permite
--     crear uno sin fecha de caducidad, no se puede crear por descuido.
--
--  2. El token es la credencial. Por eso es la clave primaria y se genera con
--     32 bytes aleatorios: no es adivinable ni enumerable como lo sería un id
--     secuencial.
--
--  3. Se registra cada apertura. Si un enlace aparece con 400 visitas, algo
--     pasó con él y conviene revocarlo.
-- ============================================================================

CREATE TABLE app.share_links (
    -- 43 caracteres de base64url a partir de 32 bytes aleatorios.
    token           text PRIMARY KEY,

    -- tc_devices.id. Sin clave foránea, como el resto del esquema `app`.
    device_id       integer NOT NULL,

    -- Para qué se creó: "cliente Pérez", "aseguradora". Ayuda a decidir cuál
    -- revocar cuando hay varios.
    label           text,

    created_at      timestamptz NOT NULL DEFAULT now(),

    -- NOT NULL a propósito: ver la nota 1 del encabezado.
    expires_at      timestamptz NOT NULL,

    -- Revocación manual, antes de que caduque solo.
    revoked_at      timestamptz,

    -- Auditoría de uso.
    views           integer NOT NULL DEFAULT 0,
    last_viewed_at  timestamptz,

    CONSTRAINT share_expires_after_creation CHECK (expires_at > created_at)
);

-- Listar los enlaces de una unidad es la consulta de la interfaz.
CREATE INDEX share_links_device_idx ON app.share_links (device_id);

-- Limpieza de los caducados hace tiempo.
CREATE INDEX share_links_expires_idx ON app.share_links (expires_at);
