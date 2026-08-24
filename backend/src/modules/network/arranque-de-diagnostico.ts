/**
 * ARRANQUE DE DIAGNÓSTICO — bloque 51.
 *
 * =============================================================================
 *  QUÉ PROBLEMA RESUELVE, Y POR QUÉ ES EL MÁS CARO DEL SISTEMA
 * =============================================================================
 *  De todo el tiempo que se tarda en reparar algo, la fase que más pesa NO es
 *  apretar tornillos: es AVERIGUAR QUÉ PASA. En la literatura de mantenimiento
 *  la reparación propiamente dicha ronda el 10 % del total; el resto se va en
 *  detectar, avisar, llegar, diagnosticar y conseguir repuesto.
 *
 *  En Pisco eso tiene una forma concreta y cara: el técnico de turno noche
 *  escanea el QR pegado en el púlpito, ve la ficha del equipo —marca, modelo,
 *  serie— y con eso todavía no sabe adónde ir. Sube al manlift a mirar la
 *  antena, y la antena estaba bien: el problema era el cable de esa cámara.
 *  Media hora perdida, de noche, con equipo elevador.
 *
 * =============================================================================
 *  LO QUE APORTA: DESCARTAR, NO DESCRIBIR
 * =============================================================================
 *  Este módulo NO añade datos nuevos a la ficha. Todos los datos ya están en el
 *  sistema, repartidos entre «De qué depende», «Mapa de red» y el almacén.
 *
 *  Lo que añade es la INFERENCIA que hoy hace el técnico de cabeza:
 *
 *      De esta antena cuelgan 6 cámaras.
 *      Las otras 5 ven bien.
 *      -> la antena está sana. El problema es de ESTA cámara.
 *
 *  Es lo que en gestión de servicios se llama diagnóstico de primer nivel:
 *  estrechar el campo antes de mover a nadie. Una sola frase que descarta media
 *  planta vale más que diez campos que la describen.
 *
 * =============================================================================
 *  TRES VEREDICTOS, Y EL TERCERO ES OBLIGATORIO
 * =============================================================================
 *  LOCAL       los vecinos ven -> el fallo es del equipo o de su tramo.
 *  COMPARTIDO  los vecinos también están caídos -> ve al soporte, no aquí.
 *  SIN_DETERMINAR  no hay enlaces cargados, o no tiene vecinos.
 *
 *  El tercero NO se disimula. Un diagnóstico inventado manda al técnico al
 *  sitio equivocado de madrugada, que es peor que no decir nada — y a la
 *  segunda vez que pase, nadie vuelve a escanear el QR.
 */

export type Veredicto = 'LOCAL' | 'COMPARTIDO' | 'SIN_DETERMINAR';

/** Gravedad de cada pista, para poder ordenarlas y pintarlas. */
export type TonoPista = 'PELIGRO' | 'AVISO' | 'DATO' | 'BIEN';

export interface Pista {
  clave: string;
  tono: TonoPista;
  /** La frase que lee el técnico. Sin jerga. */
  texto: string;
}

// ============================================================ lo que entra

export interface VecinoParaArranque {
  id: string;
  codigo: string;
  /** Estado ya derivado. */
  estado: string;
}

export interface EntradaDeArranque {
  /** El equipo que se escaneó. */
  codigo: string;
  tipo: string;
  estado: string;

  /** De qué cuelga: la antena, el switch. `null` si no hay enlace cargado. */
  soporteCodigo: string | null;
  soportePapel: string | null;
  soporteEstado: string | null;
  /** Los demás que cuelgan del mismo soporte. Sin contar a éste. */
  vecinos: VecinoParaArranque[];

  /** Montado en tablero eléctrico: abrirlo exige bloqueo. */
  enTablero: boolean;
  tableroCodigo: string | null;

  /** Cómo se llega. `null` = nadie lo declaró; NO es «a pie». */
  medioAcceso: string | null;
  alturaMetros: number | null;

  /** Del historial: la última vez que se cerró una orden sobre este equipo. */
  ultimaCausa: string | null;
  ultimaFecha: Date | string | null;
  /** Cuántas veces falló en los últimos 90 días. */
  fallasEn90Dias: number;

  /** Del almacén: repuesto compatible disponible. `null` = no se sabe. */
  repuestoDisponible: number | null;
  repuestoNombre: string | null;
}

export interface Arranque {
  veredicto: Veredicto;
  /** La frase principal. Es el producto de este módulo. */
  queDescarta: string;
  /** Adónde ir primero. */
  porDondeEmpezar: string;
  pistas: Pista[];
  /** true si hay algo que obliga a preparar antes de ir. */
  exigePreparacion: boolean;
}

// ============================================================ auxiliares

/** Estados en los que un equipo NO está dando servicio. */
const CAIDO = ['FUERA_SERVICIO', 'CON_INCIDENCIA', 'MANTENIMIENTO'];

const NOMBRE_PAPEL: Record<string, string> = {
  ANTENA: 'antena', SWITCH: 'switch', GRABADOR: 'grabador',
  SERVIDOR: 'servidor', OTRO: 'equipo',
};

/** Desde 1,80 m es trabajo en altura según la norma peruana (Ley 29783). */
const ALTURA_TRABAJO_EN_ALTURA = 1.8;

function n(cant: number, sing: string, plur: string): string {
  return `${cant} ${cant === 1 ? sing : plur}`;
}

function diasDesde(f: Date | string | null | undefined): number | null {
  if (!f) return null;
  const t = new Date(f).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** «hace 3 meses», «hace 12 días». Redondeo grueso a propósito. */
function haceCuanto(dias: number): string {
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `hace ${n(meses, 'mes', 'meses')}`;
  return `hace ${n(Math.round(dias / 365), 'año', 'años')}`;
}

// ============================================================ el cálculo

/**
 * El descarte. Es la inferencia que hoy hace el técnico de cabeza y que le
 * cuesta media hora si se equivoca.
 */
function decidir(e: EntradaDeArranque): { veredicto: Veredicto; queDescarta: string } {
  if (!e.soporteCodigo) {
    return {
      veredicto: 'SIN_DETERMINAR',
      queDescarta: 'No consta de qué cuelga este equipo, así que no se puede '
        + 'descartar nada todavía. Falta registrar su enlace en Conexiones.',
    };
  }

  const papel = NOMBRE_PAPEL[e.soportePapel || 'OTRO'] || 'equipo';

  /* El soporte caído manda sobre todo lo demás: si la antena está fuera de
     servicio, da igual cómo estén los vecinos. */
  if (e.soporteEstado && CAIDO.includes(e.soporteEstado)) {
    return {
      veredicto: 'COMPARTIDO',
      queDescarta: `${e.soporteCodigo} también está caído. El problema no es `
        + `de este equipo: empieza por ${papel === 'equipo' ? 'ahí' : `la ${papel}`}.`,
    };
  }

  if (!e.vecinos.length) {
    return {
      veredicto: 'SIN_DETERMINAR',
      queDescarta: `Cuelga de ${e.soporteCodigo} y no hay más equipos colgando `
        + 'de ahí, así que no se puede comparar con nada.',
    };
  }

  const caidos = e.vecinos.filter((v) => CAIDO.includes(v.estado));

  if (caidos.length === 0) {
    return {
      veredicto: 'LOCAL',
      queDescarta: `Cuelga de ${e.soporteCodigo}, y ${
        n(e.vecinos.length, 'el otro equipo que cuelga de ahí funciona',
          `los otros ${e.vecinos.length} equipos que cuelgan de ahí funcionan`)
      }. La ${papel} está sana: el problema es de este equipo o de su tramo.`,
    };
  }

  if (caidos.length === e.vecinos.length) {
    return {
      veredicto: 'COMPARTIDO',
      queDescarta: `Todo lo que cuelga de ${e.soporteCodigo} está caído `
        + `(${caidos.length + 1} equipos). No subas aquí: el problema está en `
        + `la ${papel} o en su alimentación.`,
    };
  }

  /* Caídos algunos pero no todos: no se puede descartar nada con certeza, y
     decir «es local» sería adivinar. Se dice lo que se ve. */
  return {
    veredicto: 'SIN_DETERMINAR',
    queDescarta: `De ${e.soporteCodigo} cuelgan ${e.vecinos.length + 1} equipos y `
      + `${caidos.length} más están caídos. Puede ser cosa de la ${papel} o `
      + 'coincidencia: revisa primero los que fallan juntos.',
  };
}

/** Adónde ir. Una sola instrucción, la primera. */
function primerPaso(e: EntradaDeArranque, v: Veredicto): string {
  if (v === 'COMPARTIDO' && e.soporteCodigo) {
    return `Ve primero a ${e.soporteCodigo}.`;
  }
  /* SE CAYÓ SÓLO ÉSTE — bloque 62-A.
     -----------------------------------------------------------------------
     El usuario lo dijo con las palabras de planta: «si se va UNA cámara lo
     más probable es que haya perdido energía PoE; si se van TODAS de golpe,
     que haya caído el switch». La segunda mitad ya la decía el veredicto
     COMPARTIDO; la primera se quedaba en «revisa este equipo y su tramo»,
     que es cierto pero no dice POR DÓNDE empezar.

     Y el orden importa: la alimentación se comprueba en un minuto desde el
     gabinete, el cable exige subir. Mandar a alguien al poste antes de
     mirar la fuente es un manlift gastado por nada. */
  if (v === 'LOCAL') {
    /* SIN SIGLAS, A PROPÓSITO. La primera versión decía «ha perdido el PoE» y
       una prueba de este mismo archivo la tumbó: prohíbe la jerga de redes
       porque esto lo lee quien esté delante del equipo, no un ingeniero de
       redes. Se dice lo mismo con las palabras de planta —«la corriente que
       le llega por el cable de red»— y se entiende igual o mejor. */
    const base = 'Empieza por la CORRIENTE de este equipo: si sólo se cayó él '
      + 'y los de al lado siguen viendo, lo más probable es que se haya quedado sin '
      + 'alimentación por el cable de red (el puerto o la fuente que lo '
      + 'energiza). Si tiene corriente, sigue por su tramo de cable.';
    return e.enTablero && e.tableroCodigo
      ? `Ve al tablero ${e.tableroCodigo}. ${base}`
      : base;
  }
  return 'Empieza comprobando si el equipo tiene alimentación y enlace.';
}

export function arranqueDeDiagnostico(e: EntradaDeArranque): Arranque {
  const { veredicto, queDescarta } = decidir(e);
  const pistas: Pista[] = [];

  /* ------------------------------------------------------------------
     SEGURIDAD PRIMERO. Lo que obliga a preparar algo antes de salir va
     arriba del todo, porque es lo único que no se puede improvisar una vez
     que ya estás delante del equipo a las tres de la mañana.
     ------------------------------------------------------------------ */
  if (e.enTablero) {
    pistas.push({
      clave: 'BLOQUEO',
      tono: 'PELIGRO',
      texto: `Está dentro del tablero eléctrico ${e.tableroCodigo || ''}`.trim()
        + '. No se abre sin bloqueo y etiquetado.',
    });
  }

  if (e.medioAcceso === 'MANLIFT' || e.medioAcceso === 'GRUA') {
    pistas.push({
      clave: 'ELEVADOR',
      tono: 'AVISO',
      texto: 'Exige equipo elevador. Resérvalo antes de ir.',
    });
  } else if (!e.medioAcceso) {
    /* Sin declarar NO es «a pie». Suponerlo hace que alguien salga sin
       preparar nada y se encuentre el equipo a ocho metros. */
    pistas.push({
      clave: 'ACCESO_SIN_DECLARAR',
      tono: 'AVISO',
      texto: 'Nadie ha declarado cómo se llega a este equipo. Compruébalo '
        + 'antes de salir: no se sabe si hace falta escalera o manlift.',
    });
  }

  if ((e.alturaMetros ?? 0) >= ALTURA_TRABAJO_EN_ALTURA) {
    pistas.push({
      clave: 'ALTURA',
      tono: 'PELIGRO',
      texto: `Está a ${e.alturaMetros} m: es trabajo en altura y exige permiso.`,
    });
  }

  // ------------------------------------------------------- historial
  const dias = diasDesde(e.ultimaFecha);
  if (e.ultimaCausa && dias !== null) {
    pistas.push({
      clave: 'ULTIMA_CAUSA',
      tono: 'DATO',
      texto: `La última vez falló ${haceCuanto(dias)} y se cerró por: ${e.ultimaCausa}.`,
    });
  } else {
    pistas.push({
      clave: 'SIN_HISTORIAL',
      tono: 'DATO',
      texto: 'No hay fallas anteriores registradas en este equipo.',
    });
  }

  /* Tres o más en 90 días deja de ser mala suerte. En gestión de servicios
     eso es un PROBLEMA, no una incidencia: arreglar el síntoma otra vez sólo
     compra tiempo hasta la siguiente. */
  if (e.fallasEn90Dias >= 3) {
    pistas.push({
      clave: 'REINCIDENTE',
      tono: 'AVISO',
      texto: `${n(e.fallasEn90Dias, 'falla', 'fallas')} en los últimos 90 días. `
        + 'Esto ya no es mala suerte: apunta la causa raíz al cerrar.',
    });
  }

  // -------------------------------------------------------- repuesto
  if (e.repuestoDisponible === null) {
    pistas.push({
      clave: 'REPUESTO_SIN_SABER',
      tono: 'DATO',
      texto: 'No consta repuesto compatible en el almacén del sistema.',
    });
  } else if (e.repuestoDisponible > 0) {
    pistas.push({
      clave: 'REPUESTO_HAY',
      tono: 'BIEN',
      texto: `Hay ${n(e.repuestoDisponible, 'repuesto', 'repuestos')} en almacén`
        + (e.repuestoNombre ? `: ${e.repuestoNombre}.` : '.'),
    });
  } else {
    pistas.push({
      clave: 'REPUESTO_CERO',
      tono: 'PELIGRO',
      texto: 'No hay repuesto en almacén. Si hace falta cambiarlo, no se '
        + 'resuelve hoy.',
    });
  }

  /* Peligro primero, luego avisos, luego datos. El técnico lee de arriba
     abajo y para de leer en cuanto tiene lo que necesita. */
  const peso: Record<TonoPista, number> = { PELIGRO: 0, AVISO: 1, DATO: 2, BIEN: 3 };
  pistas.sort((a, b) => peso[a.tono] - peso[b.tono]);

  return {
    veredicto,
    queDescarta,
    porDondeEmpezar: primerPaso(e, veredicto),
    pistas,
    exigePreparacion: pistas.some(
      (p) => p.clave === 'BLOQUEO' || p.clave === 'ELEVADOR' || p.clave === 'ALTURA',
    ),
  };
}
