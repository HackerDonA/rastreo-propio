/**
 * Rutas precargadas para el simulador de flota.
 *
 * Son polilineas de coordenadas [longitud, latitud] que trazan circuitos
 * cerrados sobre vialidades reales de tres ciudades mexicanas. Estan escritas
 * a mano a proposito: asi el simulador NO depende de ninguna API de ruteo y
 * funciona sin conexion a internet, que es un requisito del proyecto.
 *
 * El simulador interpola entre puntos consecutivos, asi que no hace falta que
 * esten muy juntos: con un punto por esquina o por curva importante basta para
 * que el recorrido se vea creible sobre el mapa.
 */

/** Un punto de la ruta: [longitud, latitud]. Mismo orden que GeoJSON. */
export type Coord = readonly [number, number];

export interface City {
  /** Nombre para mostrar en la consola. */
  readonly label: string;
  /** Centro aproximado, usado solo para mensajes informativos. */
  readonly center: Coord;
  /**
   * Circuitos disponibles. Cada unidad simulada toma uno (ciclicamente si hay
   * mas unidades que circuitos) y arranca en un punto distinto del recorrido,
   * para que no salgan todas amontonadas.
   */
  readonly loops: readonly (readonly Coord[])[];
}

/**
 * Ciudad de Mexico: Reforma, Circuito Interior y Viaducto.
 */
const CDMX: City = {
  label: 'Ciudad de Mexico',
  center: [-99.1332, 19.4326],
  loops: [
    // Paseo de la Reforma <-> Chapultepec <-> Polanco
    [
      [-99.1400, 19.4352], // Reforma / Juarez
      [-99.1533, 19.4283], // Angel de la Independencia
      [-99.1677, 19.4270], // Reforma / Sevilla
      [-99.1793, 19.4241], // Chapultepec
      [-99.1918, 19.4247], // Auditorio Nacional
      [-99.1975, 19.4318], // Polanco
      [-99.2007, 19.4388], // Masaryk
      [-99.1908, 19.4426], // Horacio
      [-99.1782, 19.4432], // Circuito Interior
      [-99.1670, 19.4404],
      [-99.1561, 19.4376],
      [-99.1462, 19.4364],
    ],
    // Insurgentes Sur: Reforma -> Del Valle -> San Angel
    [
      [-99.1554, 19.4278], // Insurgentes / Reforma
      [-99.1610, 19.4180], // Roma
      [-99.1655, 19.4055], // Condesa / Nuevo Leon
      [-99.1712, 19.3925], // Del Valle
      [-99.1768, 19.3790], // Mixcoac
      [-99.1836, 19.3648], // Barranca del Muerto
      [-99.1900, 19.3520], // San Angel
      [-99.1832, 19.3585],
      [-99.1760, 19.3712],
      [-99.1700, 19.3860],
      [-99.1640, 19.4010],
      [-99.1590, 19.4160],
    ],
    // Viaducto y Centro Historico
    [
      [-99.1332, 19.4326], // Zocalo
      [-99.1400, 19.4260], // Doctores
      [-99.1450, 19.4120], // Viaducto
      [-99.1360, 19.4030], // Viaducto oriente
      [-99.1240, 19.4020],
      [-99.1150, 19.4110],
      [-99.1120, 19.4230],
      [-99.1180, 19.4330], // Merced
      [-99.1265, 19.4360],
    ],
    // Norte: Vallejo, Lindavista, La Villa
    [
      [-99.1420, 19.4580], // Buenavista
      [-99.1490, 19.4720], // Vallejo
      [-99.1520, 19.4880],
      [-99.1400, 19.4980], // Lindavista
      [-99.1250, 19.4950],
      [-99.1170, 19.4840], // La Villa
      [-99.1210, 19.4700],
      [-99.1310, 19.4610],
    ],
  ],
};

/**
 * Monterrey: Constitucion, Gonzalitos, Garza Sada y San Pedro.
 */
const MONTERREY: City = {
  label: 'Monterrey',
  center: [-100.3161, 25.6866],
  loops: [
    // Centro <-> San Pedro por Constitucion
    [
      [-100.3161, 25.6866], // Macroplaza
      [-100.3260, 25.6805], // Constitucion poniente
      [-100.3390, 25.6760],
      [-100.3520, 25.6710],
      [-100.3660, 25.6650], // Valle Oriente
      [-100.3760, 25.6540], // San Pedro
      [-100.3670, 25.6480],
      [-100.3530, 25.6520],
      [-100.3400, 25.6600],
      [-100.3270, 25.6700],
      [-100.3190, 25.6790],
    ],
    // Gonzalitos y Tecnologico
    [
      [-100.3540, 25.6900], // Gonzalitos norte
      [-100.3520, 25.7020],
      [-100.3440, 25.7120], // Cumbres
      [-100.3300, 25.7150],
      [-100.3180, 25.7060],
      [-100.3120, 25.6930], // Centro norte
      [-100.3080, 25.6790], // Garza Sada
      [-100.3020, 25.6620], // Tecnologico
      [-100.3130, 25.6580],
      [-100.3290, 25.6680],
      [-100.3430, 25.6790],
    ],
    // Guadalupe y aeropuerto
    [
      [-100.2900, 25.6790], // Guadalupe
      [-100.2740, 25.6820],
      [-100.2580, 25.6890],
      [-100.2410, 25.6960],
      [-100.2280, 25.7080], // Apodaca
      [-100.2390, 25.7180],
      [-100.2570, 25.7120],
      [-100.2730, 25.6990],
      [-100.2850, 25.6880],
    ],
  ],
};

/**
 * Guadalajara: Lopez Mateos, Vallarta, Chapultepec y centro.
 */
const GUADALAJARA: City = {
  label: 'Guadalajara',
  center: [-103.3496, 20.6597],
  loops: [
    // Centro <-> Zapopan por Vallarta
    [
      [-103.3496, 20.6597], // Catedral
      [-103.3590, 20.6720], // Av. Vallarta
      [-103.3720, 20.6770],
      [-103.3870, 20.6810],
      [-103.4020, 20.6850], // Zapopan
      [-103.4130, 20.6960],
      [-103.4010, 20.7040],
      [-103.3850, 20.6980],
      [-103.3700, 20.6900],
      [-103.3580, 20.6790],
    ],
    // Lopez Mateos sur y Chapultepec
    [
      [-103.3690, 20.6690], // Chapultepec / Vallarta
      [-103.3760, 20.6560], // Lopez Mateos
      [-103.3840, 20.6410],
      [-103.3930, 20.6260],
      [-103.4030, 20.6110], // Plaza del Sol
      [-103.3930, 20.6040],
      [-103.3810, 20.6160],
      [-103.3720, 20.6320],
      [-103.3660, 20.6480],
      [-103.3640, 20.6610],
    ],
    // Tlaquepaque y Tonala
    [
      [-103.3380, 20.6520], // Calzada Independencia
      [-103.3240, 20.6420],
      [-103.3110, 20.6390], // Tlaquepaque
      [-103.2960, 20.6300],
      [-103.2810, 20.6250], // Tonala
      [-103.2870, 20.6390],
      [-103.3020, 20.6470],
      [-103.3180, 20.6540],
      [-103.3300, 20.6580],
    ],
  ],
};

export const CITIES = {
  cdmx: CDMX,
  monterrey: MONTERREY,
  guadalajara: GUADALAJARA,
} as const;

export type CityName = keyof typeof CITIES;

export const CITY_NAMES = Object.keys(CITIES) as readonly CityName[];

/**
 * Categorias de vehiculo que entiende el frontend. Se guardan en el campo
 * `category` de Traccar y determinan el icono de cada unidad en el mapa.
 */
export type VehicleCategory =
  | 'car'
  | 'pickup'
  | 'truck'
  | 'van'
  | 'bus'
  | 'motorcycle'
  | 'tractor'
  | 'offroad';

export interface VehicleProfile {
  readonly name: string;
  readonly category: VehicleCategory;
}

/**
 * Flota de ejemplo con sabor a algo real, para que la lista del frontend no se
 * vea como "unit-1, unit-2, unit-3".
 *
 * Las categorias estan mezcladas a proposito: con todas las unidades del mismo
 * tipo, los iconos del mapa serian identicos y no se podria comprobar que el
 * indice visual funciona.
 */
export const VEHICLES: readonly VehicleProfile[] = [
  { name: 'Nissan NP300 · Reparto 1', category: 'pickup' },
  { name: 'Ford Transit · Reparto 2', category: 'van' },
  { name: 'Chevrolet Tornado · Reparto 3', category: 'pickup' },
  { name: 'Nissan Urvan · Personal', category: 'van' },
  { name: 'Isuzu ELF · Carga 1', category: 'truck' },
  { name: 'Hino 300 · Carga 2', category: 'truck' },
  { name: 'Italika 150 · Mensajería', category: 'motorcycle' },
  { name: 'Toyota Hilux · Supervisión', category: 'offroad' },
  { name: 'Kenworth T680 · Foráneo 1', category: 'tractor' },
  { name: 'Mercedes Sprinter · Carga 3', category: 'van' },
  { name: 'Jetta · Administración', category: 'car' },
  { name: 'Ford F-150 · Campo 2', category: 'pickup' },
  { name: 'Autobús · Personal 1', category: 'bus' },
  { name: 'Freightliner M2 · Carga 4', category: 'truck' },
  { name: 'Ram 700 · Reparto 5', category: 'pickup' },
];
