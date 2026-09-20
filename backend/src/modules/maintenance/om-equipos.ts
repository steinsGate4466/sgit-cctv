/**
 * LOS EQUIPOS DE UNA ORDEN — bloque 110.
 *
 * =============================================================================
 *  POR QUÉ ESTO ES UNA FUNCIÓN PURA Y VIVE APARTE
 * =============================================================================
 *  La tabla `om_equipos` la crea la migración del 110-A, pero el cliente de
 *  Prisma no se puede generar en el entorno del agente. Así que el bloque se
 *  parte, como el 106: aquí va TODO lo que no necesita la base —que resulta ser
 *  la parte donde están las decisiones— y el servicio se escribe encima.
 *
 *  Y aunque se pudiera generar, esto seguiría separado: son las reglas que
 *  deciden qué cuenta y qué no, y tienen que poder probarse sin una base
 *  delante. El servicio lee filas; aquí se decide qué significan.
 */

export type Papel = 'REPORTADO' | 'INTERVENIDO';

export interface FilaOmEquipo {
  assetId: string;
  papel: Papel;
  accionCode?: string | null;
  nota?: string | null;
  asset?: { id: string; assetCode?: string | null; type?: string | null } | null;
}

export interface EquiposDeLaOrden {
  reportados: string[];
  intervenidos: string[];
  /** Se reportó algo y se tocó otra cosa. NO es lo mismo que «se tocó de más». */
  cambioDeAlcance: boolean;
  /** Reportados que NADIE tocó. Es la lista que hay que explicar a Producción. */
  reportadosSinTocar: string[];
  /** Tocados que nadie había reportado: lo que el técnico encontró por su cuenta. */
  intervenidosNoReportados: string[];
  /** Equipos distintos que participan, con cualquier papel. */
  cuantosEquipos: number;
}

/**
 * Ordena las filas en las dos listas y saca las tres cifras que interesan.
 *
 * ---------------------------------------------------------------------------
 * «CAMBIO DE ALCANCE» NO ES «SE TOCÓ DE MÁS»
 * ---------------------------------------------------------------------------
 * Hasta el bloque 110 esto era un booleano (`scopeChanged`) y no distinguía
 * dos situaciones que en planta no se parecen en nada:
 *
 *   · Se reportó la cámara 45, se tocó el switch: **lo reportado quedó sin
 *     tocar.** Producción tiene que enterarse, porque su cámara puede seguir
 *     mal.
 *   · Se reportó la cámara 45, se tocó la cámara 45 Y ADEMÁS el switch: no
 *     quedó nada pendiente; el técnico encontró algo más.
 *
 * Las dos cambian el alcance. Sólo la primera deja una deuda.
 */
export function equiposDeLaOrden(filas: FilaOmEquipo[]): EquiposDeLaOrden {
  const reportados: string[] = [];
  const intervenidos: string[] = [];

  for (const f of filas || []) {
    if (!f?.assetId) continue;
    const lista = f.papel === 'REPORTADO' ? reportados : intervenidos;
    if (!lista.includes(f.assetId)) lista.push(f.assetId);
  }

  const reportadosSinTocar = reportados.filter((id) => !intervenidos.includes(id));
  const intervenidosNoReportados = intervenidos.filter((id) => !reportados.includes(id));
  const todos = new Set([...reportados, ...intervenidos]);

  return {
    reportados,
    intervenidos,
    /* Hay cambio de alcance si algo reportado se quedó sin tocar O si se tocó
       algo que nadie pidió. Las dos cosas son información para el ingeniero. */
    cambioDeAlcance: reportadosSinTocar.length > 0 || intervenidosNoReportados.length > 0,
    reportadosSinTocar,
    intervenidosNoReportados,
    cuantosEquipos: todos.size,
  };
}

/**
 * CUÁNTAS INTERVENCIONES HUBO DE VERDAD.
 *
 * =============================================================================
 *  LA CIFRA QUE IBA MAL AL COMITÉ
 * =============================================================================
 *  Los indicadores contaban ÓRDENES. Una campaña de mapeo que recorrió el lecho
 *  de enfriamiento y levantó doce cámaras contaba **uno**. Un tren donde se
 *  tocaron cuarenta equipos reportaba doce órdenes — y con esa cifra se pide
 *  presupuesto.
 *
 *  Aquí se cuenta el par (orden, equipo intervenido), que es el trabajo real.
 *
 * =============================================================================
 *  LAS DOS CIFRAS CONVIVEN, Y NINGUNA SUSTITUYE A LA OTRA
 * =============================================================================
 *  «Órdenes» sigue siendo la unidad de GESTIÓN: una parada, un permiso, un
 *  cierre. «Intervenciones» es la unidad de TRABAJO. Enseñar sólo la segunda
 *  haría creer que se abrieron cuarenta órdenes; enseñar sólo la primera es lo
 *  que veníamos haciendo mal.
 *
 *  Por eso esta función devuelve las dos y la pantalla escribe las dos.
 */
export interface Conteo {
  ordenes: number;
  intervenciones: number;
  /** Equipos distintos tocados en el periodo, sin contar dos veces el mismo. */
  equiposDistintos: number;
  /** Cuántos equipos toca de media una orden. Con 0 órdenes es 0, no NaN. */
  equiposPorOrden: number;
}

export function contar(
  ordenes: Array<{ id: string; equipos?: Array<{ assetId: string; papel: Papel }> }>,
): Conteo {
  const lista = ordenes || [];
  const pares = new Set<string>();
  const equipos = new Set<string>();

  for (const o of lista) {
    for (const e of o.equipos || []) {
      if (!e?.assetId || e.papel !== 'INTERVENIDO') continue;
      pares.add(`${o.id}|${e.assetId}`);
      equipos.add(e.assetId);
    }
  }

  /* UN NÚMERO QUE NO SE PUEDE CALCULAR NO SE INVENTA: con cero órdenes la media
     es 0, nunca NaN ni Infinity. Un NaN en un tablero que va a una reunión es
     peor que una casilla vacía, porque parece un número. */
  const equiposPorOrden = lista.length
    ? Math.round((pares.size / lista.length) * 10) / 10
    : 0;

  return {
    ordenes: lista.length,
    intervenciones: pares.size,
    equiposDistintos: equipos.size,
    equiposPorOrden,
  };
}

/**
 * La frase para la pantalla, ya redactada. Sale de aquí y no de cada tablero
 * para que los cuatro sitios que la enseñan digan exactamente lo mismo — la
 * misma decisión que `SIN_TREN_ASIGNADO` en `ambito-usuario.ts`.
 */
export function frase(c: Conteo): string {
  if (!c.ordenes) return 'Sin órdenes en el periodo.';
  if (c.intervenciones === c.ordenes) {
    return `${c.ordenes} órdenes, un equipo cada una.`;
  }
  return `${c.ordenes} órdenes sobre ${c.intervenciones} equipos `
    + `(${c.equiposPorOrden} por orden de media).`;
}
