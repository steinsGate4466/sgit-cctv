/* =============================================================================
   EL MAPA REGULA — bloque 176. Lógica pura (sin base de datos), probada en
   `test/mapa-regula.spec.ts`.

   Tres cosas que el usuario pidió sobre el mismo plano:
     1. ZONAS DE RIESGO con borde de color (alto riesgo, altura, eléctrico,
        calor, zona vital), dibujadas o deducidas de lo declarado.
     2. EL CABLE del switch a cada equipo, con sus metros.
     3. LOS AVISOS DE NORMA dentro del mapa: el UTP de más de 90 m, el cable
        que cruza una zona de riesgo, el switch sin PoE o sin puertos.

   Regla de siempre: lo que no está declarado NO se dibuja como si lo
   estuviera. Una línea sin trazar dice «estimado»; una cámara sin puerto
   dice «sin conexión declarada». Nunca verde por falta de datos.
============================================================================= */
import { Punto, dentroDeZona, dentroDelPlano } from './geometria';

export const NIVELES_RIESGO = ['ALTO_RIESGO', 'ALTURA', 'ELECTRICO', 'CALOR', 'VITAL'] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number];

/** Del más grave al menos: el borde de una zona con varios niveles es el primero. */
export const ORDEN_RIESGO: Record<NivelRiesgo, number> = { ALTO_RIESGO: 0, ELECTRICO: 1, ALTURA: 2, CALOR: 3, VITAL: 4 };

export const NOMBRE_RIESGO: Record<NivelRiesgo, string> = {
  ALTO_RIESGO: 'Zona de alto riesgo',
  ALTURA: 'Trabajo en altura',
  ELECTRICO: 'Riesgo eléctrico',
  CALOR: 'Calor / material caliente',
  VITAL: 'Zona vital de Producción',
};

/**
 * TIA-568: el ENLACE PERMANENTE de cobre (de la roseta o el equipo al panel)
 * llega a 90 m; el canal completo, con los latiguillos, a 100 m. Se avisa
 * contra 90: es el tramo que se tiende y el que no se puede alargar después.
 */
export const TOPE_UTP_M = 90;
export const MAX_PUNTOS_TRAZADO = 60;

/* ---------------------------------------------------------------- riesgo */

/**
 * Lo que una UBICACIÓN ya dice de sí misma, traducido a niveles de riesgo.
 * Así una sala declarada en Ubicaciones sale con su borde sin dibujarla otra
 * vez. Cada nivel lleva su porqué, en palabras de planta.
 */
export function riesgosDeUbicacion(l: {
  riesgoPersonas?: boolean | null; riesgoPersonasMotivo?: string | null;
  requiereAltura?: boolean | null; intervencionFirmada?: string | null;
  criticidadProduccion?: string | null;
}): { nivel: NivelRiesgo; porque: string }[] {
  const r: { nivel: NivelRiesgo; porque: string }[] = [];
  if (l.riesgoPersonas) r.push({ nivel: 'ALTO_RIESGO', porque: l.riesgoPersonasMotivo || 'Declarada con riesgo para personas.' });
  if (l.intervencionFirmada === 'EXIGE_PARADA') r.push({ nivel: 'ALTO_RIESGO', porque: 'Se interviene sólo con el tren parado.' });
  if (l.intervencionFirmada === 'CON_PERMISO_ELECTRICO') r.push({ nivel: 'ELECTRICO', porque: 'Se interviene con permiso eléctrico.' });
  if (l.intervencionFirmada === 'CON_PERMISO_ALTURA' || l.requiereAltura) r.push({ nivel: 'ALTURA', porque: 'Para llegar hay que subir.' });
  if (l.criticidadProduccion === 'CRITICA' || l.criticidadProduccion === 'ALTA') {
    r.push({ nivel: 'VITAL', porque: 'Producción la declaró vital: no puede quedar sin vista.' });
  }
  // Un nivel una sola vez, con el primer porqué.
  const vistos = new Set<string>();
  return r.filter((x) => (vistos.has(x.nivel) ? false : (vistos.add(x.nivel), true)));
}

export function esNivel(v: unknown): v is NivelRiesgo {
  return typeof v === 'string' && (NIVELES_RIESGO as readonly string[]).includes(v);
}

/** Los niveles que tocan a un punto: los de las áreas dibujadas que lo contienen. */
export function nivelesEnPunto(x: number, y: number, zonas: { nivel: NivelRiesgo; puntos: Punto[] }[]): NivelRiesgo[] {
  const s = new Set<NivelRiesgo>();
  for (const z of zonas) if (dentroDeZona(x, y, z.puntos)) s.add(z.nivel);
  return [...s].sort((a, b) => ORDEN_RIESGO[a] - ORDEN_RIESGO[b]);
}

/* ---------------------------------------------------------------- cable */

/** Largo de una línea quebrada, en píxeles. */
export function largoPx(linea: Punto[]): number {
  let l = 0;
  for (let i = 1; i < linea.length; i++) l += Math.hypot(linea[i][0] - linea[i - 1][0], linea[i][1] - linea[i - 1][1]);
  return l;
}

/**
 * El recorrido del cable. Con trazado: switch → puntos → equipo. Sin trazado:
 * en L (primero en horizontal y luego en vertical), que es por donde va un
 * cable de verdad —por bandeja, no en diagonal— y es la misma estimación que
 * usaba la tarjeta desde el bloque 151.
 */
export function recorrido(sw: { x: number; y: number }, eq: { x: number; y: number }, puntos: Punto[] | null): Punto[] {
  if (puntos && puntos.length) return [[sw.x, sw.y], ...puntos, [eq.x, eq.y]];
  return [[sw.x, sw.y], [eq.x, sw.y], [eq.x, eq.y]];
}

/** ¿Se cruzan los segmentos ab y cd? */
function cruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const o = (p: Punto, q: Punto, r: Punto) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** ¿La línea pasa por dentro de la zona (un vértice dentro o un tramo que corta su borde)? */
export function lineaPasaPorZona(linea: Punto[], pol: Punto[]): boolean {
  if (linea.some(([x, y]) => dentroDeZona(x, y, pol))) return true;
  for (let i = 1; i < linea.length; i++) {
    for (let j = 0; j < pol.length; j++) {
      if (cruzan(linea[i - 1], linea[i], pol[j], pol[(j + 1) % pol.length])) return true;
    }
  }
  return false;
}

/** Valida los puntos de un trazado: lista de [x, y] dentro del plano. */
export function validarTrazado(puntos: unknown, anchoPx: number, altoPx: number): { puntos: Punto[] } | { error: string } {
  if (!Array.isArray(puntos)) return { error: 'El trazado es una lista de puntos.' };
  if (puntos.length > MAX_PUNTOS_TRAZADO) return { error: `Un trazado tiene como mucho ${MAX_PUNTOS_TRAZADO} puntos.` };
  const r: Punto[] = [];
  for (const p of puntos) {
    if (!Array.isArray(p) || p.length !== 2) return { error: 'Cada punto del trazado es [x, y].' };
    const [x, y] = p.map(Number);
    if (!dentroDelPlano(x, y, anchoPx, altoPx)) return { error: 'Un punto del trazado cae fuera del plano.' };
    r.push([Math.round(x), Math.round(y)]);
  }
  return { puntos: r };
}

/* ---------------------------------------------------------------- avisos */

export type Gravedad = 'grave' | 'aviso' | 'info';
export interface AvisoDeNorma {
  clave: string; gravedad: Gravedad; texto: string; assetId: string | null; xPx: number; yPx: number;
}
const PESO: Record<Gravedad, number> = { grave: 0, aviso: 1, info: 2 };

/**
 * Los avisos de norma del plano, lo más grave primero. Cada uno dice dónde
 * está (para que el mapa te lleve) y qué incumple, en una frase.
 */
export function avisosDeNorma(d: {
  cables: { assetId: string; codigo: string; metros: number | null; estimado: boolean; esEnlace: boolean;
    cruza: { nivel: NivelRiesgo; nombre: string }[]; medio: [number, number] }[];
  switches: { assetId: string; codigo: string; xPx: number; yPx: number;
    capacidad: number | null; ocupados: number; poeUsados: number; poePuertos: number | null }[];
  sinConexion: { assetId: string; codigo: string; xPx: number; yPx: number }[];
  switchFuera: { assetId: string; codigo: string; switchCodigo: string; xPx: number; yPx: number }[];
}): AvisoDeNorma[] {
  const a: AvisoDeNorma[] = [];
  for (const c of d.cables) {
    if (!c.esEnlace && c.metros != null && c.metros > TOPE_UTP_M) {
      a.push({
        clave: 'UTP_90', gravedad: 'grave', assetId: c.assetId, xPx: c.medio[0], yPx: c.medio[1],
        texto: `${c.codigo}: ${c.metros} m de cable${c.estimado ? ' (estimado)' : ''}. Pasa de ${TOPE_UTP_M} m (TIA-568): extensor, switch más cerca o fibra.`,
      });
    }
    for (const z of c.cruza) {
      if (z.nivel === 'ALTO_RIESGO' || z.nivel === 'ELECTRICO' || z.nivel === 'CALOR') {
        a.push({
          clave: 'CRUZA_' + z.nivel, gravedad: 'aviso', assetId: c.assetId, xPx: c.medio[0], yPx: c.medio[1],
          texto: `El cable de ${c.codigo} pasa por «${z.nombre}» (${NOMBRE_RIESGO[z.nivel].toLowerCase()}): tenderlo o repararlo exige ese permiso.`,
        });
      }
    }
  }
  for (const s of d.switches) {
    if (s.capacidad != null && s.ocupados >= s.capacidad) {
      a.push({ clave: 'SIN_PUERTOS', gravedad: 'aviso', assetId: s.assetId, xPx: s.xPx, yPx: s.yPx,
        texto: `${s.codigo}: no le quedan puertos libres (${s.ocupados} de ${s.capacidad}).` });
    }
    if (s.poePuertos != null && s.poePuertos > 0 && s.poeUsados >= s.poePuertos) {
      a.push({ clave: 'SIN_POE', gravedad: 'aviso', assetId: s.assetId, xPx: s.xPx, yPx: s.yPx,
        texto: `${s.codigo}: todo su PoE está usado (${s.poeUsados} de ${s.poePuertos}). Una cámara más necesita inyector.` });
    }
    if (s.capacidad == null) {
      a.push({ clave: 'SW_SIN_FICHA', gravedad: 'info', assetId: s.assetId, xPx: s.xPx, yPx: s.yPx,
        texto: `${s.codigo}: falta declarar cuántos puertos tiene. Sin eso no se sabe si cabe otro equipo.` });
    }
  }
  for (const e of d.sinConexion) {
    a.push({ clave: 'SIN_CONEXION', gravedad: 'info', assetId: e.assetId, xPx: e.xPx, yPx: e.yPx,
      texto: `${e.codigo}: sin conexión declarada. No se sabe de qué switch cuelga.` });
  }
  for (const e of d.switchFuera) {
    a.push({ clave: 'SW_FUERA', gravedad: 'info', assetId: e.assetId, xPx: e.xPx, yPx: e.yPx,
      texto: `${e.codigo}: su switch (${e.switchCodigo}) no está en este plano. No se puede medir el cable.` });
  }
  return a.sort((x, y) => PESO[x.gravedad] - PESO[y.gravedad]);
}
