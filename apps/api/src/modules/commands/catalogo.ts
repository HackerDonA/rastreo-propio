/**
 * Catálogo de comandos remotos.
 *
 * Traccar conoce 46 tipos y los nombra en inglés técnico (`engineStop`,
 * `alarmArm`). Aquí se traducen y, sobre todo, se clasifican por **riesgo**,
 * que es lo que decide cuánta fricción pone la interfaz antes de ejecutarlos.
 *
 * Función pura, sin dependencias: es fácil de probar y de revisar.
 */

/**
 * Nivel de riesgo de un comando.
 *
 *   seguro     · no cambia nada en el vehículo (pedir posición, versión)
 *   cuidado    · cambia configuración o estado, pero es reversible
 *   peligroso  · puede afectar la conducción o dejar el equipo inservible
 */
export type Riesgo = 'seguro' | 'cuidado' | 'peligroso';

export interface DescripcionComando {
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly riesgo: Riesgo;
  /** Advertencia extra que la interfaz muestra antes de confirmar. */
  readonly advertencia?: string;
}

export const CATALOGO: Readonly<Record<string, DescripcionComando>> = {
  // --- Sin riesgo ---
  positionSingle: {
    etiqueta: 'Pedir posición ahora',
    descripcion: 'Solicita una ubicación inmediata sin esperar al siguiente reporte.',
    riesgo: 'seguro',
  },
  getDeviceStatus: {
    etiqueta: 'Consultar estado',
    descripcion: 'Pide batería, señal y estado general del equipo.',
    riesgo: 'seguro',
  },
  getModemStatus: {
    etiqueta: 'Estado del módem',
    descripcion: 'Pide el estado de la conexión celular.',
    riesgo: 'seguro',
  },
  getVersion: {
    etiqueta: 'Versión del firmware',
    descripcion: 'Consulta qué versión tiene instalada el equipo.',
    riesgo: 'seguro',
  },
  deviceIdentification: {
    etiqueta: 'Identificarse',
    descripcion: 'Pide al equipo que confirme su identificador.',
    riesgo: 'seguro',
  },
  requestPhoto: {
    etiqueta: 'Pedir foto',
    descripcion: 'Solicita una imagen, si el equipo tiene cámara.',
    riesgo: 'seguro',
  },

  // --- Cambian configuración, reversibles ---
  positionPeriodic: {
    etiqueta: 'Cambiar frecuencia de reporte',
    descripcion: 'Ajusta cada cuánto manda su posición.',
    riesgo: 'cuidado',
    advertencia:
      'Un intervalo muy corto consume más datos y batería. Un intervalo largo hace que el odómetro salga corto.',
  },
  positionStop: {
    etiqueta: 'Detener reportes',
    descripcion: 'El equipo deja de mandar posiciones.',
    riesgo: 'cuidado',
    advertencia: 'La unidad desaparecerá del mapa hasta que vuelvas a activarla.',
  },
  alarmArm: {
    etiqueta: 'Armar alarma',
    descripcion: 'Activa la alarma antirrobo del equipo.',
    riesgo: 'cuidado',
  },
  alarmDisarm: {
    etiqueta: 'Desarmar alarma',
    descripcion: 'Desactiva la alarma antirrobo.',
    riesgo: 'cuidado',
  },
  alarmDismiss: {
    etiqueta: 'Silenciar alarma',
    descripcion: 'Apaga una alarma que está sonando.',
    riesgo: 'cuidado',
  },
  setTimezone: {
    etiqueta: 'Ajustar zona horaria',
    descripcion: 'Cambia la zona horaria del equipo.',
    riesgo: 'cuidado',
    advertencia:
      'Debe quedar en UTC 0. Cualquier otro valor desfasa los viajes y los reportes.',
  },
  setOdometer: {
    etiqueta: 'Ajustar odómetro',
    descripcion: 'Fija el kilometraje que reporta el equipo.',
    riesgo: 'cuidado',
  },
  setSpeedLimit: {
    etiqueta: 'Límite de velocidad',
    descripcion: 'Define a partir de qué velocidad avisa por exceso.',
    riesgo: 'cuidado',
  },
  sendSms: {
    etiqueta: 'Enviar SMS',
    descripcion: 'Hace que el equipo mande un SMS a un número.',
    riesgo: 'cuidado',
  },
  outputControl: {
    etiqueta: 'Controlar salida',
    descripcion: 'Activa o desactiva una salida digital del equipo.',
    riesgo: 'cuidado',
    advertencia:
      'Comprueba a qué está conectada esa salida antes de usarla: en muchas instalaciones es el relevador del motor.',
  },
  rebootDevice: {
    etiqueta: 'Reiniciar equipo',
    descripcion: 'Reinicia el rastreador.',
    riesgo: 'cuidado',
    advertencia: 'Tardará un par de minutos en volver a reportar.',
  },
  custom: {
    etiqueta: 'Comando personalizado',
    descripcion: 'Envía texto crudo al equipo, tal cual.',
    riesgo: 'cuidado',
    advertencia:
      'Solo si sabes exactamente qué acepta tu modelo. Un comando mal escrito puede dejar el equipo sin responder.',
  },

  // --- Peligrosos ---
  engineStop: {
    etiqueta: 'Apagar motor',
    descripcion: 'Corta el paso de corriente al motor mediante el relevador.',
    riesgo: 'peligroso',
    advertencia:
      'NUNCA con el vehículo en movimiento: se pierde la dirección asistida y los frenos endurecen. Úsalo solo con el vehículo detenido.',
  },
  engineResume: {
    etiqueta: 'Encender motor',
    descripcion: 'Restablece la corriente al motor.',
    riesgo: 'cuidado',
  },
  powerOff: {
    etiqueta: 'Apagar el rastreador',
    descripcion: 'Apaga el equipo por completo.',
    riesgo: 'peligroso',
    advertencia:
      'Un equipo apagado no se puede encender a distancia: hay que ir físicamente al vehículo.',
  },
  factoryReset: {
    etiqueta: 'Restablecer de fábrica',
    descripcion: 'Borra toda la configuración del equipo.',
    riesgo: 'peligroso',
    advertencia:
      'Se pierden el APN y la dirección del servidor. El equipo dejará de reportar y habrá que reconfigurarlo por SMS.',
  },
  setConnection: {
    etiqueta: 'Cambiar servidor',
    descripcion: 'Apunta el equipo a otra dirección y puerto.',
    riesgo: 'peligroso',
    advertencia:
      'Si la dirección está mal, el equipo deja de reportar y solo se recupera por SMS o desmontándolo.',
  },
  firmwareUpdate: {
    etiqueta: 'Actualizar firmware',
    descripcion: 'Instala una versión nueva del firmware.',
    riesgo: 'peligroso',
    advertencia: 'Una actualización interrumpida puede inutilizar el equipo.',
  },
};

/** Comandos que exigen que el vehículo esté detenido. */
export const EXIGEN_VEHICULO_DETENIDO: readonly string[] = ['engineStop', 'outputControl'];

/** Velocidad (km/h) por debajo de la cual se considera el vehículo detenido. */
export const VELOCIDAD_DETENIDO_KMH = 5;

export function describirComando(tipo: string): DescripcionComando {
  return (
    CATALOGO[tipo] ?? {
      // Traccar puede añadir tipos nuevos; mejor mostrarlos que ocultarlos,
      // pero sin fingir que sabemos qué hacen.
      etiqueta: tipo,
      descripcion: 'Comando no catalogado. Consulta el manual de tu equipo.',
      riesgo: 'cuidado',
    }
  );
}
