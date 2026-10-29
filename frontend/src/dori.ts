/* =============================================================================
   LO QUE VE UNA CÁMARA, EN PALABRAS DE PLANTA — bloque 184
   -----------------------------------------------------------------------------
   DORI (norma IEC 62676-4) mide cuántos píxeles caen en un metro de escena.
   Nadie en el púlpito habla de píxeles por metro: habla de si se le ve la cara
   a alguien o sólo se nota que pasa algo. Estos son los mismos cuatro niveles
   dichos así. El NÚMERO de cada nivel lo da la ficha del fabricante y lo
   calcula el servidor (`modelos/vision.ts`); aquí sólo se nombra y se pinta.
============================================================================= */

export type NivelDori = 'identificar' | 'reconocer' | 'observar' | 'detectar';

export interface NivelInfo {
  clave: NivelDori;
  /** Lo que se puede hacer con la imagen a esa distancia. */
  texto: string;
  /** Para la leyenda del mapa. */
  corto: string;
  /** La norma, para quien la busque (va en el `title`). */
  norma: string;
  /** Cuánto se rellena la franja: más fuerte cuanto más detalle. */
  opacidad: number;
}

export const NIVELES_DORI: NivelInfo[] = [
  { clave: 'identificar', texto: 'Se ve la cara: se sabe quién es', corto: 'Cara', norma: 'Identificar · 250 píxeles por metro', opacidad: 0.42 },
  { clave: 'reconocer', texto: 'Se reconoce a alguien conocido', corto: 'Persona', norma: 'Reconocer · 125 píxeles por metro', opacidad: 0.3 },
  { clave: 'observar', texto: 'Se ve qué está haciendo', corto: 'Qué hace', norma: 'Observar · 62 píxeles por metro', opacidad: 0.19 },
  { clave: 'detectar', texto: 'Sólo se nota que hay alguien', corto: 'Hay alguien', norma: 'Detectar · 25 píxeles por metro', opacidad: 0.09 },
];

export type Distancias = Record<NivelDori, number>;

/** Lo que manda el servidor para una cámara colocada en un plano. */
export interface VisionDelPunto {
  angulo: number;
  zoom: number;
  zoomMax: number;
  dia: Distancias;
  /** De noche, sólo con la luz infrarroja de la cámara. `null` si la ficha no la da. */
  noche: Distancias | null;
  irM: number | null;
  fichaId: string;
  lente: string;
  marca: string | null;
  modelo: string | null;
  verificada: boolean;
}

/** «6 m», «2.8 m», «2,400 m»: con el formato de Perú, igual que las fichas. */
export function metros(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return 'sin dato';
  return `${m.toLocaleString('es-PE', { maximumFractionDigits: m < 10 ? 1 : 0 })} m`;
}
