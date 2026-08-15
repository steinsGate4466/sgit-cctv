/* =============================================================================
   RIESGO DE QUEDARSE SIN RECAMBIO — bloque 32
   -----------------------------------------------------------------------------
   Dos preguntas distintas que en el fondo son la misma:

     · «¿Qué repuesto NO puede faltar, porque sostiene una zona vital?»
     · «¿Qué cámaras ya no se consiguen en el mercado?»

   Las dos contestan a lo mismo: DÓNDE ESTAMOS EXPUESTOS A QUEDARNOS SIN
   ARREGLO. Una por el almacén, la otra por el fabricante.

   Y ninguna necesita precios, que es el punto: este análisis se puede hacer
   HOY, sin esperar a que Almacén cargue las tarifas.

   -----------------------------------------------------------------------------
   LA DIFERENCIA CON UN «STOCK BAJO MÍNIMO» DE TODA LA VIDA
   Un mínimo es un número que alguien puso una vez. Aquí el mínimo se mira
   CONTRA LA REALIDAD: cuántos equipos dependen de ese repuesto y en qué zonas
   están. Tener una unidad de un repuesto que sostiene una cámara del
   estacionamiento es suficiente; tener una que sostiene cuatro cámaras de la
   salida del horno no lo es.
============================================================================= */

export type NivelRiesgo = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO' | 'SIN_DATOS';

export const ORDEN_RIESGO: Record<NivelRiesgo, number> = {
  CRITICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3, SIN_DATOS: 4,
};

/* =============================================================================
   1. REPUESTO CRÍTICO
============================================================================= */

export interface RepuestoParaRiesgo {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  minimo: number | null;
  /** Cuántos equipos usan este repuesto. */
  equiposQueLoUsan: number;
  /** De esos, cuántos están en una zona declarada vital por Producción. */
  equiposEnZonaVital: number;
  /** Nombres de las zonas vitales afectadas. */
  zonasVitales: string[];
}

export interface RiesgoRepuesto extends RepuestoParaRiesgo {
  nivel: NivelRiesgo;
  porQue: string;
}

/**
 * Cuánto duele que falte este repuesto.
 *
 * El criterio NO es sólo el stock. Un repuesto con cero unidades que no
 * sostiene nada no es una urgencia; uno con una unidad que sostiene cuatro
 * cámaras de una zona vital sí lo es.
 */
export function riesgoDeRepuesto(r: RepuestoParaRiesgo): RiesgoRepuesto {
  const sinStock = r.stock <= 0;
  const bajoMinimo = r.minimo != null && r.stock < r.minimo;
  const sostieneVital = r.equiposEnZonaVital > 0;
  // No alcanza para cubrir ni una avería por equipo vital.
  const noAlcanza = sostieneVital && r.stock < r.equiposEnZonaVital;

  let nivel: NivelRiesgo;
  let porQue: string;

  if (sostieneVital && sinStock) {
    nivel = 'CRITICO';
    porQue =
      `Cero unidades y sostiene ${r.equiposEnZonaVital} equipo(s) en zona vital ` +
      `(${r.zonasVitales.join(', ')}). Si falla uno, se queda así hasta que llegue la compra.`;
  } else if (sostieneVital && noAlcanza) {
    nivel = 'ALTO';
    porQue =
      `Hay ${r.stock} y sostiene ${r.equiposEnZonaVital} equipo(s) en zona vital. ` +
      'No alcanza si fallan dos a la vez, que es justo lo que pasa cuando la causa es común.';
  } else if (sostieneVital && bajoMinimo) {
    nivel = 'ALTO';
    porQue = `Bajo el mínimo (${r.stock} de ${r.minimo}) y sostiene zona vital.`;
  } else if (sinStock && r.equiposQueLoUsan > 0) {
    nivel = 'MEDIO';
    porQue = `Sin stock. Lo usan ${r.equiposQueLoUsan} equipo(s), ninguno en zona vital.`;
  } else if (bajoMinimo) {
    nivel = 'MEDIO';
    porQue = `Bajo el mínimo: ${r.stock} de ${r.minimo}.`;
  } else if (sostieneVital) {
    nivel = 'BAJO';
    porQue = `Cubierto: ${r.stock} unidades para ${r.equiposEnZonaVital} equipo(s) en zona vital.`;
  } else if (r.equiposQueLoUsan === 0) {
    /* Ni un solo equipo lo usa. NO es «riesgo bajo»: es que nadie ha dicho
       para qué sirve. Marcarlo como bajo escondería el problema real, que es
       de datos, no de almacén. */
    nivel = 'SIN_DATOS';
    porQue = 'Ningún equipo declara usar este repuesto. Falta enlazarlo, o ya no hace falta.';
  } else {
    nivel = 'BAJO';
    porQue = 'Stock suficiente para lo que sostiene.';
  }

  return { ...r, nivel, porQue };
}

/** Ordena por lo que duele, y a igualdad por cuántos equipos vitales sostiene. */
export function ordenarPorRiesgo<T extends { nivel: NivelRiesgo; equiposEnZonaVital: number; codigo: string }>(
  lista: T[],
): T[] {
  return [...lista].sort(
    (a, b) => ORDEN_RIESGO[a.nivel] - ORDEN_RIESGO[b.nivel]
      || b.equiposEnZonaVital - a.equiposEnZonaVital
      || String(a.codigo).localeCompare(String(b.codigo)),
  );
}

/* =============================================================================
   2. OBSOLESCENCIA DEL EQUIPO
   -----------------------------------------------------------------------------
   Aquí NO se inventa la fecha de fin de soporte de un modelo: la escribe quien
   la consulte con el fabricante. Lo que sí se puede derivar sin preguntar nada
   es cuántos años lleva instalado el equipo, y eso ya ordena bastante.
============================================================================= */

export interface EquipoParaObsolescencia {
  id: string;
  assetCode: string;
  marca?: string | null;
  modelo?: string | null;
  /** Cuándo se instaló o se dio de alta. */
  desde?: Date | null;
  /** Fin de soporte del fabricante, si alguien lo averiguó. */
  finDeSoporte?: Date | null;
  /** true si ya no se consigue recambio. Lo marca una persona. */
  sinRecambio?: boolean;
  zonaVital?: boolean;
  zonaNombre?: string | null;
}

export interface RiesgoEquipo extends EquipoParaObsolescencia {
  nivel: NivelRiesgo;
  anosInstalado: number | null;
  porQue: string;
}

/** Años cumplidos desde la fecha, o null si no hay fecha. */
export function anosDesde(desde: Date | null | undefined, ahora: number): number | null {
  if (!desde) return null;
  const ms = ahora - desde.getTime();
  if (ms < 0) return null;             // fecha futura: dato malo, no se inventa
  return Math.floor(ms / (365.25 * 86_400_000));
}

/**
 * Riesgo de obsolescencia.
 *
 * `sinRecambio` manda sobre todo lo demás: da igual que el equipo sea del año
 * pasado, si no hay pieza no hay arreglo.
 *
 * @param umbralAnos  a partir de cuántos años se considera viejo. Se pasa
 *   desde fuera porque una cámara en el horno envejece distinto que una en el
 *   púlpito, y ese criterio lo pone la planta, no el código.
 */
export function riesgoDeEquipo(
  e: EquipoParaObsolescencia, ahora: number, umbralAnos = 8,
): RiesgoEquipo {
  const anos = anosDesde(e.desde, ahora);
  const soporteVencido = !!e.finDeSoporte && e.finDeSoporte.getTime() < ahora;
  const viejo = anos != null && anos >= umbralAnos;

  let nivel: NivelRiesgo;
  let porQue: string;

  if (e.sinRecambio && e.zonaVital) {
    nivel = 'CRITICO';
    porQue = `Sin recambio en el mercado y está en zona vital${e.zonaNombre ? ` (${e.zonaNombre})` : ''}. Si falla, no se arregla: se reemplaza el modelo entero.`;
  } else if (e.sinRecambio) {
    nivel = 'ALTO';
    porQue = 'Sin recambio en el mercado. Cuando falle habrá que cambiar de modelo.';
  } else if (soporteVencido && e.zonaVital) {
    nivel = 'ALTO';
    porQue = `El fabricante dejó de darle soporte y está en zona vital. Sin parches de firmware.`;
  } else if (soporteVencido) {
    nivel = 'MEDIO';
    porQue = 'El fabricante dejó de darle soporte. Sin parches de firmware.';
  } else if (viejo && e.zonaVital) {
    nivel = 'MEDIO';
    porQue = `${anos} años instalado y en zona vital. Conviene averiguar si sigue habiendo recambio.`;
  } else if (viejo) {
    nivel = 'BAJO';
    porQue = `${anos} años instalado.`;
  } else if (anos == null) {
    /* Sin fecha no se dice «bajo riesgo»: se dice que falta el dato. Un
       inventario donde la mitad sale en verde por estar vacío es peor que uno
       que admite lo que no sabe. */
    nivel = 'SIN_DATOS';
    porQue = 'No consta desde cuándo está instalado. Sin esa fecha no se puede valorar.';
  } else {
    nivel = 'BAJO';
    porQue = `${anos} año(s) instalado, con soporte.`;
  }

  return { ...e, nivel, anosInstalado: anos, porQue };
}

/** El titular de la pantalla. Una frase, no un número. */
export function titularDeRiesgo(
  criticos: number, altos: number, sinDatos: number, total: number,
): string {
  if (!total) return 'Todavía no hay nada cargado para valorar.';
  if (criticos) {
    return `${criticos} punto(s) sin recambio y en zona vital. Si fallan hoy, no se arreglan hoy.`;
  }
  if (altos) return `${altos} punto(s) de riesgo alto. Ninguno deja una zona vital sin salida todavía.`;
  if (sinDatos) return `Sin riesgos altos, pero faltan datos en ${sinDatos} de ${total}. Lo que no se sabe no se puede valorar.`;
  return 'Sin puntos de riesgo. Todo lo valorado tiene recambio.';
}
