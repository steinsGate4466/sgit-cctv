/**
 * LA LÍNEA DE TIEMPO DE UNA CÁMARA CAÍDA — bloque 39.
 *
 * =============================================================================
 *  LA PREGUNTA DEL JEFE DE TREN
 * =============================================================================
 *  No es «cuántas cámaras hay caídas». Es esto, en este orden:
 *
 *      ¿Cuál falla?  ¿A qué hora se fue?  ¿Alguien la está atacando?
 *      ¿Cómo va?  ¿Hasta dónde pueden llegar?
 *
 *  Y hay una que nadie del área de Mantenimiento se hace, porque no le toca:
 *
 *      ¿DÓNDE SE ESTÁ YENDO EL TIEMPO?
 *
 *  Ése es el dato que este archivo calcula y que hoy no tiene nadie. Si entre
 *  «se fue» y «alguien avisó» pasaron cuatro horas, el problema NO es
 *  Mantenimiento: es que nadie mira las pantallas del púlpito. Sin separar los
 *  tramos, esas cuatro horas se le cargan al que arregla.
 *
 * =============================================================================
 *  LA DISTINCIÓN QUE NO SE PUEDE PERDER: CAÍDA ≠ REPORTE
 * =============================================================================
 *  «A qué hora se fue» y «a qué hora lo reportaron» son datos DISTINTOS, y
 *  confundirlos es mentir con precisión de reloj.
 *
 *   · Si el AGENTE de monitoreo está instalado, `lastSeenAt` dice cuándo dejó
 *     de responder de verdad. Es la hora buena.
 *
 *   · Si no lo está —y hoy en Pisco NO lo está— lo único que hay es la hora en
 *     que una persona abrió la incidencia.
 *
 *  Si la cámara se fue a las 06:12 y alguien avisó a las 09:30, enseñar «3
 *  horas sin visión» cuando son 6 h 30 es un error de más del doble, y encima
 *  favorece al que llega tarde a mirar.
 *
 *  Por eso cada hito lleva su `origen`, y la pantalla dice cuál está
 *  enseñando. Sin agente: «reportada a las 06:31», nunca «se cayó a las 06:31».
 */

export type OrigenDeLaHora = 'AGENTE' | 'PERSONA' | 'SIN_DATO';

export interface Hito {
  clave: 'CAIDA' | 'REPORTE' | 'ASIGNACION' | 'INICIO' | 'CIERRE';
  /** Lo que se lee en la pantalla. */
  etiqueta: string;
  cuando: Date | null;
  /** De dónde sale la hora. `SIN_DATO` = el hito no ha ocurrido o no consta. */
  origen: OrigenDeLaHora;
  /** Quién, cuando se sabe. */
  quien?: string | null;
  /** Minutos transcurridos desde el hito anterior que SÍ tiene hora. */
  desdeElAnterior: number | null;
}

export interface EntradaLineaDeTiempo {
  /** Del agente de monitoreo. `null` si no hay agente o nunca respondió. */
  dejoDeResponderEn?: Date | null;
  /** Fallos seguidos que vio el agente. Se exige más de uno para creerlo. */
  fallosSeguidos?: number | null;
  reportadaEn?: Date | null;
  reportadaPor?: string | null;
  ordenAbiertaEn?: Date | null;
  asignadaA?: string | null;
  trabajoIniciadoEn?: Date | null;
  inicioFirmadoPor?: string | null;
  cerradaEn?: Date | null;
  cerradaPor?: string | null;
}

/** Minutos entre dos fechas, o null si falta alguna. */
function minutosEntre(a: Date | null | undefined, b: Date | null | undefined): number | null {
  if (!a || !b) return null;
  const d = Math.round((b.getTime() - a.getTime()) / 60_000);
  /* Un negativo significa que las horas están cruzadas —un reloj mal puesto,
     una fecha escrita a mano hacia atrás—. Se devuelve null en vez de un
     número negativo: «-40 minutos» en una pantalla no lo entiende nadie, y
     peor aún, se restaría del total y lo dejaría más corto de lo real. */
  return d < 0 ? null : d;
}

/**
 * Cuántos fallos seguidos hacen falta para creerse que una cámara se cayó.
 *
 * Es el mismo número que usa `frescura.ts`, y tiene que serlo: si aquí se
 * creyera con uno y allí con tres, la misma cámara saldría caída en una
 * pantalla y viva en otra.
 */
export const FALLOS_PARA_CREER_LA_CAIDA = 3;

/**
 * Arma la línea de tiempo con los hitos que SÍ ocurrieron.
 *
 * Los que no han pasado todavía no se incluyen: una lista con tres hitos
 * grises de «pendiente» hace parecer que falta información cuando lo que pasa
 * es que el trabajo va por la mitad.
 */
export function construirLineaDeTiempo(e: EntradaLineaDeTiempo): Hito[] {
  const hitos: Hito[] = [];

  /* LA CAÍDA sólo se declara si el agente la vio Y la vio bastantes veces.
     Con uno o dos fallos no se dibuja: una pérdida suelta en una wifi
     industrial es lo normal, no una avería, y pintarla como caída llenaría
     la pantalla del jefe de falsas alarmas hasta que dejara de mirarla. */
  const caidaFiable =
    !!e.dejoDeResponderEn && (e.fallosSeguidos ?? 0) >= FALLOS_PARA_CREER_LA_CAIDA;

  if (caidaFiable) {
    hitos.push({
      clave: 'CAIDA',
      etiqueta: 'Dejó de responder',
      cuando: e.dejoDeResponderEn!,
      origen: 'AGENTE',
      quien: `lo detectó el monitoreo, ${e.fallosSeguidos} fallos seguidos`,
      desdeElAnterior: null,
    });
  }

  if (e.reportadaEn) {
    hitos.push({
      clave: 'REPORTE',
      etiqueta: 'Reportada',
      cuando: e.reportadaEn,
      origen: 'PERSONA',
      quien: e.reportadaPor ?? null,
      desdeElAnterior: null,
    });
  }

  if (e.ordenAbiertaEn) {
    hitos.push({
      clave: 'ASIGNACION',
      etiqueta: 'Orden abierta y asignada',
      cuando: e.ordenAbiertaEn,
      origen: 'PERSONA',
      quien: e.asignadaA ?? null,
      desdeElAnterior: null,
    });
  }

  if (e.trabajoIniciadoEn) {
    hitos.push({
      clave: 'INICIO',
      etiqueta: 'Trabajando en el equipo',
      cuando: e.trabajoIniciadoEn,
      origen: 'PERSONA',
      /* «Firmó la apertura» no es un detalle: es la diferencia entre una orden
         asignada —un papel— y un técnico con las manos en la cámara. */
      quien: e.inicioFirmadoPor ? `${e.inicioFirmadoPor} firmó la apertura` : 'apertura firmada',
      desdeElAnterior: null,
    });
  }

  if (e.cerradaEn) {
    hitos.push({
      clave: 'CIERRE',
      etiqueta: 'Resuelta',
      cuando: e.cerradaEn,
      origen: 'PERSONA',
      quien: e.cerradaPor ?? null,
      desdeElAnterior: null,
    });
  }

  // Los huecos, que son la parte que se audita.
  for (let i = 1; i < hitos.length; i++) {
    hitos[i].desdeElAnterior = minutosEntre(hitos[i - 1].cuando, hitos[i].cuando);
  }

  return hitos;
}

export interface ResumenDeTiempo {
  /** Minutos desde el primer hito conocido hasta ahora (o hasta el cierre). */
  totalMin: number | null;
  /** Sobre qué hito se está contando: cambia lo que significa el número. */
  contadoDesde: 'CAIDA' | 'REPORTE' | null;
  /**
   * `true` cuando el reloj arranca en el REPORTE porque no hay agente. La
   * pantalla lo usa para no decir «sin visión desde» sino «reportada hace».
   */
  horaDeCaidaDesconocida: boolean;
  /** Minutos entre que se fue y que alguien avisó. El tramo que no es de Mantenimiento. */
  minHastaQueAvisaron: number | null;
  /** Minutos entre que avisaron y que se asignó la orden. */
  minHastaQueAsignaron: number | null;
  /** Minutos entre que se asignó y que el técnico firmó la apertura. */
  minHastaQueEmpezaron: number | null;
}

/**
 * El resumen que se enseña arriba de la tarjeta.
 *
 * SEPARAR LOS TRAMOS ES TODO EL PUNTO. Un «lleva 6 horas caída» no dice nada
 * accionable. Lo que sí dice algo es: 4 h hasta que alguien avisó, 13 min
 * hasta asignar, 1 h 14 hasta empezar. De esas tres, sólo las dos últimas son
 * de Mantenimiento.
 */
export function resumirTiempo(hitos: Hito[], ahora: number = Date.now()): ResumenDeTiempo {
  const de = (c: Hito['clave']) => hitos.find((h) => h.clave === c) ?? null;
  const caida = de('CAIDA');
  const reporte = de('REPORTE');
  const asignacion = de('ASIGNACION');
  const inicio = de('INICIO');
  const cierre = de('CIERRE');

  const primero = caida ?? reporte;
  const hasta = cierre?.cuando ? cierre.cuando.getTime() : ahora;

  return {
    totalMin: primero?.cuando
      ? Math.max(0, Math.round((hasta - primero.cuando.getTime()) / 60_000))
      : null,
    contadoDesde: caida ? 'CAIDA' : reporte ? 'REPORTE' : null,
    horaDeCaidaDesconocida: !caida,
    minHastaQueAvisaron: minutosEntre(caida?.cuando, reporte?.cuando),
    minHastaQueAsignaron: minutosEntre(reporte?.cuando, asignacion?.cuando),
    minHastaQueEmpezaron: minutosEntre(asignacion?.cuando, inicio?.cuando),
  };
}

/**
 * Minutos en la forma en que la gente los dice.
 *
 * «195 minutos» obliga a dividir mentalmente. «3 h 15 min» se lee. Y para algo
 * de hace tres días, los minutos sobran: nadie decide nada por 40 minutos
 * arriba o abajo cuando lleva tres días caída.
 */
export function enPalabras(min: number | null): string {
  if (min === null) return 'sin dato';
  if (min < 1) return 'hace un momento';
  if (min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;

  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d} d ${hr} h` : `${d} d`;
}

/* =============================================================================
   LOS MATERIALES — lo que Producción necesita para poder comprar
   ============================================================================= */

export type EstadoMaterialLinea = 'SOLICITADO' | 'RETIRADO' | 'DEVUELTO' | 'RECHAZADO';

export interface MaterialParaMirar {
  descripcion: string;
  sapCode?: string | null;
  estado: EstadoMaterialLinea;
  /** Lo que el técnico previó que hace falta. */
  previsto?: number | null;
  /** Lo que ya salió del almacén. */
  retirado?: number | null;
  /** Lo que hay en el almacén. `null` = no está en el catálogo. */
  stock?: number | null;
  motivoRechazo?: string | null;
}

export interface VeredictoMaterial extends MaterialParaMirar {
  /** Cuántas unidades faltan para poder terminar. 0 = no falta nada. */
  faltan: number;
  /** `true` si esto es lo que impide avanzar. */
  bloquea: boolean;
  /** La frase que dispara una compra, o explica que no hace falta ninguna. */
  texto: string;
}

/**
 * Qué falta para poder terminar, línea por línea.
 *
 * POR QUÉ ESTO LO VE PRODUCCIÓN Y NO SÓLO MANTENIMIENTO
 * El jefe de tren no arregla la cámara. Pero sí puede empujar una compra, y
 * hoy se entera de que faltaba un conector cuando ya lleva dos semanas sin
 * ver el colado. Enseñarle la línea que bloquea, con el código de SAP, le
 * permite mover una compra el mismo día.
 *
 * MIRA. NO TOCA. Aquí no hay ningún botón: es un veredicto de lectura.
 */
export function veredictoDeMaterial(m: MaterialParaMirar): VeredictoMaterial {
  const previsto = m.previsto ?? 0;
  const retirado = m.retirado ?? 0;

  if (m.estado === 'RECHAZADO') {
    return {
      ...m, faltan: 0, bloquea: false,
      texto: m.motivoRechazo
        ? `No autorizado: ${m.motivoRechazo}`
        : 'No autorizado por el ingeniero.',
    };
  }

  if (m.estado === 'RETIRADO' || m.estado === 'DEVUELTO') {
    return { ...m, faltan: 0, bloquea: false, texto: 'Ya salió de almacén.' };
  }

  // SOLICITADO: todavía no ha salido. Aquí es donde puede faltar algo.
  const pendiente = Math.max(0, previsto - retirado);

  if (m.stock === null || m.stock === undefined) {
    /* Un material escrito a mano, fuera del catálogo. NO se dice «faltan»:
       no se sabe. Decir que falta obligaría a comprar algo que quizá está en
       el estante, y decir que hay sería peor. */
    return {
      ...m, faltan: 0, bloquea: false,
      texto: 'Escrito a mano, sin código de almacén: no se puede saber si hay.',
    };
  }

  const faltan = Math.max(0, pendiente - m.stock);

  if (faltan > 0) {
    return {
      ...m, faltan, bloquea: true,
      texto: `Faltan ${faltan} de ${pendiente}. El almacén tiene ${m.stock}.`
        + (m.sapCode ? ` Código SAP ${m.sapCode}.` : ''),
    };
  }

  return {
    ...m, faltan: 0, bloquea: false,
    texto: `Hay ${m.stock} en almacén, pendiente de retirar.`,
  };
}

/**
 * La frase de arriba: ¿hace falta comprar algo o no?
 *
 * Se redacta AQUÍ y no en la pantalla para que diga lo mismo en la web, en el
 * PDF y en el aviso de Telegram el día que se enganche.
 */
export function titularDeMateriales(v: VeredictoMaterial[]): string | null {
  const bloqueantes = v.filter((x) => x.bloquea);
  if (!bloqueantes.length) return null;

  if (bloqueantes.length === 1) {
    return `Falta material para terminar: ${bloqueantes[0].descripcion}.`;
  }
  return `Faltan ${bloqueantes.length} materiales para poder terminar.`;
}
