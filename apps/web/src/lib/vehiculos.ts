/**
 * Catalogo de tipos de vehiculo.
 *
 * El tipo se guarda en el campo `category` de Traccar, que ya existe y es texto
 * libre pensado para agrupar unidades. Reutilizarlo en vez de inventar un
 * atributo propio tiene una ventaja concreta: la categoria tambien se ve bien
 * en la interfaz nativa de Traccar.
 *
 * Los iconos son trazos SVG en linea, no archivos. Asi no hay peticiones extra,
 * heredan el color del texto y se ven nitidos a cualquier tamano.
 */

export const CATEGORIAS = [
  'car',
  'pickup',
  'truck',
  'van',
  'bus',
  'motorcycle',
  'tractor',
  'offroad',
  'default',
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export interface TipoVehiculo {
  readonly etiqueta: string;
  /** Contenido del <svg viewBox="0 0 24 24">. Trazo, no relleno. */
  readonly trazo: string;
}

/** Ruedas compartidas por casi todos los tipos, para no repetirlas. */
const RUEDAS = '<circle cx="7.5" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>';

export const TIPOS: Readonly<Record<Categoria, TipoVehiculo>> = {
  car: {
    etiqueta: 'Automóvil',
    trazo: `<path d="M3 17v-3.2l2-4.3A2 2 0 0 1 6.8 8h10.4a2 2 0 0 1 1.8 1.5l2 4.3V17"/><path d="M5 13.5h14"/><path d="M3 17h2M19 17h2"/>${RUEDAS}`,
  },
  pickup: {
    etiqueta: 'Camioneta',
    trazo: `<path d="M2 17v-4h7V9.5a1.5 1.5 0 0 1 1.5-1.5h3l3 5H22v4"/><path d="M2 13h20"/><path d="M2 17h3.5M9.5 17h5M19 17h3"/>${RUEDAS}`,
  },
  truck: {
    etiqueta: 'Camión',
    trazo: `<path d="M2 17V6h11v11"/><path d="M13 10h4l4 4v3"/><path d="M2 17h3.5M9.5 17h5M19 17h3"/>${RUEDAS}`,
  },
  van: {
    etiqueta: 'Van',
    trazo: `<path d="M2 17V8a1 1 0 0 1 1-1h11l5 5.5V17"/><path d="M14 7v5.5h5"/><path d="M2 17h3.5M9.5 17h5M19 17h1"/>${RUEDAS}`,
  },
  bus: {
    etiqueta: 'Autobús',
    trazo: `<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 14h.01M17 14h.01"/><path d="M6 17v1.5M18 17v1.5"/>`,
  },
  motorcycle: {
    etiqueta: 'Motocicleta',
    trazo: `<circle cx="5" cy="16" r="3.2"/><circle cx="19" cy="16" r="3.2"/><path d="M5 16l4-5h5l2 5"/><path d="M9 11h5"/><path d="M14 8h3"/>`,
  },
  tractor: {
    etiqueta: 'Tractocamión',
    trazo: `<path d="M2 17V9h8v8"/><path d="M10 12h5l6 3v2"/><path d="M2 17h2M8 17h4M15 17h2M20 17h2"/><circle cx="6" cy="17" r="2"/><circle cx="13.5" cy="17" r="1.8"/><circle cx="18.5" cy="17" r="1.8"/>`,
  },
  offroad: {
    etiqueta: 'Todoterreno',
    trazo: `<path d="M3 16v-3l2-4.5A2 2 0 0 1 6.8 7h10.4a2 2 0 0 1 1.8 1.5L21 13v3"/><path d="M5 12.5h14"/><path d="M12 7v5.5"/><circle cx="7" cy="16.5" r="2.6"/><circle cx="17" cy="16.5" r="2.6"/>`,
  },
  default: {
    etiqueta: 'Sin especificar',
    trazo: `<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>`,
  },
};

/** Normaliza lo que venga de Traccar a una categoria conocida. */
export function aCategoria(valor: string | null): Categoria {
  if (valor !== null && (CATEGORIAS as readonly string[]).includes(valor)) {
    return valor as Categoria;
  }
  return 'default';
}

export function tipoDe(categoria: string | null): TipoVehiculo {
  return TIPOS[aCategoria(categoria)];
}
