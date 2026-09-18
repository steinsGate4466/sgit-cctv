/**
 * EN QUÉ VA LA ORDEN — bloque 113.
 *
 * =============================================================================
 *  LA PREGUNTA QUE SE HACE POR RADIO
 * =============================================================================
 *  Palabras del usuario: «quiero ver en qué van mis técnicos, cómo están
 *  avanzando, si están llenando todo el formulario, en qué proceso están, si
 *  están por acabar o de repente ni siquiera han empezado».
 *
 *  Eso no es un porcentaje. Un 0 % puede ser dos cosas MUY distintas:
 *
 *    · el técnico aún no ha tocado la orden  →  Producción tiene que reclamar
 *    · el técnico está dentro, esperando repuesto →  Producción tiene que
 *      resolver el repuesto, no reclamar
 *
 *  Un tablero que pinta las dos igual obliga a coger la radio, que es justo
 *  lo que este software viene a evitar.
 *
 * =============================================================================
 *  POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO UN CAMPO EN LA BASE
 * =============================================================================
 *  Es la regla fundacional del proyecto: lo que se puede calcular no se
 *  guarda. Un campo `estadoAvance` habría que mantenerlo al día en los seis
 *  sitios que tocan una orden, y el día que uno se olvide, el tablero miente
 *  sin que nadie lo note — el peor fallo posible en una pantalla que se mira
 *  de pasada.
 *
 *  Y se calcula en el SERVIDOR, no en la pantalla: el mismo veredicto vale
 *  para el tablero de Producción, para el informe y para lo que venga. Si lo
 *  decidiera cada pantalla, dentro de tres bloques habría tres definiciones de
 *  «por acabar» y ninguna sería la buena.
 */

export type EstadoAvance =
  /** Nadie la ha tocado. Ni detallada, ni arrancada, ni un solo avance. */
  | 'SIN_EMPEZAR'
  /** Detallada pero todavía sin arrancar en campo: el técnico ya la preparó. */
  | 'PREPARADA'
  /** En marcha. */
  | 'EN_CURSO'
  /** Del 80 % para arriba: cabe en la parada de hoy. */
  | 'POR_ACABAR'
  /** Parada por un motivo declarado. NO es «va lenta»: es «está bloqueada». */
  | 'DETENIDA';

/** A partir de aquí se considera que la orden cabe en la parada de hoy. */
export const UMBRAL_POR_ACABAR = 80;

export interface OrdenParaAvance {
  status: string;
  progressPct?: number | null;
  detailedAt?: Date | string | null;
  startedAt?: Date | string | null;
  ultimoAvanceEn?: Date | string | null;
}

/**
 * El veredicto. El ORDEN de las comprobaciones es el diseño entero:
 *
 *  1. EN_ESPERA manda sobre todo lo demás. Una orden al 60 % parada por falta
 *     de manlift no está «en curso»: está detenida, y pintarla igual que una
 *     que avanza es lo que hace que nadie la desbloquee.
 *  2. Después el avance declarado, que es el dato más fuerte que hay.
 *  3. Y sólo al final, cuando el avance es 0, se mira si alguien la tocó:
 *     detallada o arrancada es «preparada»; nada de nada es «sin empezar».
 */
export function estadoDeAvance(o: OrdenParaAvance): EstadoAvance {
  if (o.status === 'EN_ESPERA') return 'DETENIDA';

  const pct = typeof o.progressPct === 'number' ? o.progressPct : 0;
  if (pct >= UMBRAL_POR_ACABAR) return 'POR_ACABAR';
  if (pct > 0) return 'EN_CURSO';

  /* Avance 0. Que haya arrancado en campo cuenta como empezar aunque no haya
     declarado porcentaje: el técnico está allí. */
  if (o.startedAt) return 'EN_CURSO';
  if (o.ultimoAvanceEn) return 'EN_CURSO';
  if (o.detailedAt) return 'PREPARADA';
  return 'SIN_EMPEZAR';
}

/**
 * La frase, ya redactada, para que las pantallas no se inventen cada una la
 * suya. Es la misma decisión que `SIN_TREN_ASIGNADO` en `ambito-usuario.ts`.
 */
export const FRASE_DE_AVANCE: Record<EstadoAvance, string> = {
  SIN_EMPEZAR: 'Todavía no la ha tocado nadie',
  PREPARADA: 'Preparada, sin arrancar en campo',
  EN_CURSO: 'En curso',
  POR_ACABAR: 'Por acabar',
  DETENIDA: 'Detenida, esperando algo',
};

/**
 * Cuántas horas lleva sin que nadie declare nada. Se devuelve para poder
 * escribirlo en pantalla, NO para colorear solo: una orden de tres días que
 * lleva dos horas sin avance es normal; una de una parada de 40 minutos, no.
 * Quien juzga es la persona; el software le pone el dato delante.
 */
export function horasSinNoticias(
  o: OrdenParaAvance,
  creadaEn: Date | string,
  ahora: Date = new Date(),
): number {
  const ref = o.ultimoAvanceEn ?? o.startedAt ?? o.detailedAt ?? creadaEn;
  const ms = ahora.getTime() - new Date(ref).getTime();
  return ms > 0 ? Math.floor(ms / 3_600_000) : 0;
}
