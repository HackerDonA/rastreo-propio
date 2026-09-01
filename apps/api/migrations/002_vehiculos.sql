-- ============================================================================
--  002 · Ficha administrativa de cada vehículo
-- ============================================================================
--  Traccar guarda lo telemático: posiciones, viajes, eventos. Lo administrativo
--  —placa, VIN, póliza, conductor, vencimientos— no es su problema y no tiene
--  dónde ponerlo salvo un JSON suelto de atributos.
--
--  Va en nuestro esquema `app`, con una fila por unidad de Traccar. Sin clave
--  foránea hacia tc_devices, por el mismo motivo del resto del esquema: no
--  queremos que borrar una unidad en Traccar borre en cascada el expediente
--  del vehículo. Ver docs/adr/0004-schema-app-separado.md.
-- ============================================================================

CREATE TABLE app.vehicles (
    -- Es el id de tc_devices. Se usa como PK directamente: hay exactamente una
    -- ficha por unidad, así que una columna id propia solo estorbaría.
    device_id           integer PRIMARY KEY,

    -- --- Identificación ---
    plate               text,
    vin                 text,
    brand               text,
    model               text,
    year                integer,
    color               text,

    -- --- Operación ---
    driver_name         text,
    driver_phone        text,
    -- Área, ruta o base a la que pertenece. Texto libre a propósito: cada
    -- flota organiza distinto y una tabla de catálogos sería sobreingeniería
    -- para diez vehículos.
    assignment          text,

    -- --- Odómetro real ---
    -- Traccar acumula distancia desde que la unidad empezó a reportar, no
    -- desde que el vehículo salió de la agencia. Este es el kilometraje del
    -- tablero al momento de instalar el rastreador; sumado al totalDistance de
    -- Traccar da el kilometraje real.
    odometer_offset_km  numeric(12, 2),

    -- --- Documentos y vencimientos ---
    insurance_policy    text,
    insurance_expires   date,
    -- En México: verificación vehicular y tenencia.
    inspection_expires  date,
    registration_expires date,

    notes               text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT vehicle_year_plausible CHECK (year IS NULL OR (year >= 1950 AND year <= 2100)),
    CONSTRAINT vehicle_odometer_positive CHECK (odometer_offset_km IS NULL OR odometer_offset_km >= 0)
);

-- Buscar por placa es la consulta más frecuente después de por nombre.
-- Parcial porque la mayoría de las fichas nuevas aún no la tienen capturada.
CREATE INDEX vehicles_plate_idx ON app.vehicles (upper(plate)) WHERE plate IS NOT NULL;

-- Para el tablero de "qué vence pronto".
CREATE INDEX vehicles_expiries_idx
    ON app.vehicles (insurance_expires, inspection_expires, registration_expires);
