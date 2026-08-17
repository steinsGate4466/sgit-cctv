/* =============================================================================
   CÓMO SE LLEGA A CADA EQUIPO — bloque 41
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTE ARCHIVO

   Producción paga el manlift. Hasta hoy nadie podía decirle cuántos equipos de
   su tren exigen uno, así que cada subida se pedía suelta, se aprobaba suelta y
   se pagaba suelta — y dos cámaras del mismo poste se atendían en dos días
   distintos con dos manlifts distintos.

   Esto no es una pantalla de costos. Es la lista de qué hay en cada tren, dónde
   está montado y cómo se llega. El ahorro sale solo de ver juntos los equipos
   que comparten subida.

   =============================================================================
    LA REGLA QUE SOSTIENE TODO: «NO DECLARADO» NO ES «NO HACE FALTA»
   =============================================================================
   La zona sabe si hay que subir (`Location.requiereAltura`), pero la zona es
   demasiado gruesa para esto: en la misma zona del púlpito del Tren 2 hay una
   cámara en la pared a 2 m y otra en el poste del lecho a 8 m. Contarlas igual
   da un número que no aguanta la primera pregunta de Producción.

   Por eso el medio de acceso se declara POR ACTIVO. Y mientras nadie lo
   declare, el veredicto es SIN_DECLARAR — nunca «se llega a pie».

   La diferencia importa en las dos direcciones:
     · Si el sistema asumiera «a pie», Producción vería un número bajo, lo
       aprobaría, y el día del trabajo faltaría el manlift.
     · Si asumiera «manlift», el número saldría inflado y Producción dejaría de
       fiarse de la pantalla, que es peor: una cifra que nadie cree no ordena
       nada.

   El sistema PROPONE desde la zona y lo dice en voz alta («aquí propondría
   manlift»), pero la propuesta no cuenta en el total. Es exactamente la misma
   regla que la intervenibilidad del bloque 28: la propuesta sugiere, sólo la
   declaración vale.

   =============================================================================
    POR QUÉ NO SE REUTILIZA EL ENUM `AccessMeans`
   =============================================================================
   `AccessMeans` es el medio que se PIDE en una solicitud de altura. Nadie pide
   permiso para llegar caminando, así que no tiene A_PIE. Reutilizarlo obligaría
   a marcar «escalera» en una cámara del púlpito a la que se llega andando: un
   dato falso metido para rellenar una casilla obligatoria.

   =============================================================================
    ESTE ARCHIVO NO SABE QUE EXISTE PRISMA
   =============================================================================
   Recibe datos planos y devuelve el veredicto. La regla de qué cuenta como
   subida y qué no es la que va a mirar Producción para aprobar un gasto, y una
   regla así hay que poder probarla caso por caso con datos escritos a mano.
============================================================================= */

/** El umbral de SSOMA. Desde 1.80 m es trabajo en altura y exige PETAR. */
export const ALTURA_DE_TRABAJO_EN_ALTURA_M = 1.8;

/**
 * Cómo se llega al equipo. Lo declara quien lo instaló o quien subió la última
 * vez: es la única persona que lo sabe de verdad.
 */
export type MedioAcceso =
  /** Se llega caminando: gabinete, púlpito, sala eléctrica, tablero a nivel. */
  | 'A_PIE'
  /** Escalera portátil. Bajo 1.80 m no es trabajo en altura. */
  | 'ESCALERA'
  | 'ANDAMIO'
  /** Plataforma elevadora. Es la cara, y la que Producción costea. */
  | 'MANLIFT'
  /** Izaje con grúa. Además del equipo, suele exigir parar la grúa. */
  | 'GRUA'
  | 'LINEA_VIDA'
  /** Lo que la lista no prevé. Cuenta como no resuelto, no como «a pie». */
  | 'OTRO';

export const ETIQUETA_MEDIO: Record<MedioAcceso, string> = {
  A_PIE: 'Se llega a pie',
  ESCALERA: 'Escalera',
  ANDAMIO: 'Andamio',
  MANLIFT: 'Manlift',
  GRUA: 'Grúa',
  LINEA_VIDA: 'Línea de vida',
  OTRO: 'Otro medio',
};

/** Los medios que obligan a movilizar un equipo elevador. */
const MOVILIZA_EQUIPO: MedioAcceso[] = ['MANLIFT', 'GRUA'];

export function exigeEquipoElevador(m: MedioAcceso | null | undefined): boolean {
  return !!m && MOVILIZA_EQUIPO.includes(m);
}

/**
 * DÓNDE ESTÁ MONTADO. Se deriva de si el activo cuelga de un gabinete o de un
 * tablero; no es un campo que nadie tenga que rellenar.
 *
 * Estos tres grupos no son una clasificación bonita: son exactamente los tres
 * sitios donde CAMBIA el medio de acceso. Al gabinete se entra a pie y con
 * llave; al tablero se entra a pie y con permiso eléctrico; al campo se sube.
 */
export type Montaje = 'GABINETE' | 'TABLERO' | 'CAMPO';

export const ETIQUETA_MONTAJE: Record<Montaje, string> = {
  GABINETE: 'En gabinete',
  TABLERO: 'Dentro de tablero eléctrico',
  CAMPO: 'En campo',
};

export function montajeDe(a: { cabinetId?: string | null; tableroId?: string | null }): Montaje {
  /* El tablero manda sobre el gabinete si por error tuviera los dos: un switch
     atornillado dentro de un tablero eléctrico se abre con bloqueo, y esa es la
     condición más restrictiva de las dos. */
  if (a.tableroId) return 'TABLERO';
  if (a.cabinetId) return 'GABINETE';
  return 'CAMPO';
}

export type VeredictoAcceso =
  /** Declarado y exige equipo elevador. Es lo que Producción costea. */
  | 'EXIGE_ELEVADOR'
  /** Declarado, hay que subir, pero con escalera o andamio. */
  | 'SUBIDA_SIN_ELEVADOR'
  /** Declarado y se llega caminando. */
  | 'A_PIE'
  /** Nadie lo ha declarado. NO es «a pie». */
  | 'SIN_DECLARAR';

export const ETIQUETA_VEREDICTO: Record<VeredictoAcceso, string> = {
  EXIGE_ELEVADOR: 'Exige manlift o grúa',
  SUBIDA_SIN_ELEVADOR: 'Hay que subir, sin elevador',
  A_PIE: 'Se llega a pie',
  SIN_DECLARAR: 'Sin declarar',
};

export interface ActivoParaAcceso {
  id: string;
  cabinetId?: string | null;
  tableroId?: string | null;
  /** Lo que alguien DECLARÓ. null = nadie lo ha dicho. */
  medioAcceso?: MedioAcceso | null;
  alturaMetros?: number | null;
  accesoDeclaradoEn?: Date | null;
  /** Lo que dice la zona de la que cuelga, heredado del árbol. */
  zonaRequiereAltura?: boolean;
}

export interface Acceso {
  veredicto: VeredictoAcceso;
  medio: MedioAcceso | null;
  alturaMetros: number | null;
  declarado: boolean;
  /** Lo que el sistema propondría. Informa; NO cuenta en los totales. */
  propuesta: MedioAcceso | null;
  /** Trabajo en altura según SSOMA: 1.80 m o más. */
  esTrabajoEnAltura: boolean;
  /** Frase para la pantalla, ya redactada aquí para que diga lo mismo en todas partes. */
  motivo: string;
  /**
   * Un dato que se contradice consigo mismo. No se corrige solo: se enseña,
   * porque corregirlo en silencio sería inventar el que falta.
   */
  contradiccion: string | null;
}

/**
 * El veredicto de UN activo.
 *
 * Ojo con el orden de las ramas: lo DECLARADO se mira primero y gana siempre.
 * Si la propuesta pudiera pisar una declaración, la declaración no serviría de
 * nada — y entonces nadie volvería a molestarse en declararla.
 */
export function accesoDeActivo(a: ActivoParaAcceso): Acceso {
  const altura = typeof a.alturaMetros === 'number' ? a.alturaMetros : null;
  const enAltura = altura !== null && altura >= ALTURA_DE_TRABAJO_EN_ALTURA_M;
  const propuesta: MedioAcceso | null = a.zonaRequiereAltura ? 'MANLIFT' : null;

  if (!a.medioAcceso) {
    return {
      veredicto: 'SIN_DECLARAR',
      medio: null,
      alturaMetros: altura,
      declarado: false,
      propuesta,
      esTrabajoEnAltura: enAltura,
      motivo: propuesta
        ? 'Nadie ha declarado cómo se llega. La zona está marcada como de altura, '
          + 'así que probablemente haga falta manlift — pero eso hay que confirmarlo '
          + 'antes de contarlo en un pedido.'
        : 'Nadie ha declarado cómo se llega a este equipo. Que no esté declarado '
          + 'no quiere decir que se llegue a pie.',
      contradiccion: null,
    };
  }

  const medio = a.medioAcceso;

  /* LAS DOS CONTRADICCIONES QUE SE VEN EN PLANTA.
     Ninguna se arregla sola. La primera es peligrosa: alguien puede ir sin
     permiso de altura confiando en la ficha. La segunda sólo infla el gasto,
     pero infla el gasto de Producción. */
  let contradiccion: string | null = null;
  if (medio === 'A_PIE' && enAltura) {
    contradiccion = `Declarado «se llega a pie» pero a ${altura} m. Desde `
      + `${ALTURA_DE_TRABAJO_EN_ALTURA_M} m es trabajo en altura y exige PETAR. `
      + 'Uno de los dos datos está mal.';
  } else if (exigeEquipoElevador(medio) && altura !== null && !enAltura) {
    contradiccion = `Declarado «${ETIQUETA_MEDIO[medio].toLowerCase()}» para ${altura} m. `
      + 'A esa altura suele bastar una escalera: conviene revisarlo antes de '
      + 'movilizar el equipo.';
  }

  const veredicto: VeredictoAcceso = exigeEquipoElevador(medio)
    ? 'EXIGE_ELEVADOR'
    : medio === 'A_PIE'
      ? 'A_PIE'
      : 'SUBIDA_SIN_ELEVADOR';

  return {
    veredicto,
    medio,
    alturaMetros: altura,
    declarado: true,
    propuesta,
    esTrabajoEnAltura: enAltura,
    motivo: altura !== null
      ? `${ETIQUETA_MEDIO[medio]} · ${altura} m`
      : ETIQUETA_MEDIO[medio],
    contradiccion,
  };
}

/* =============================================================================
   AGRUPAR SUBIDAS
   -----------------------------------------------------------------------------
   Aquí está el valor real del módulo para Producción, y es una resta sencilla:
   si en el poste del lecho hay tres equipos que exigen manlift y los tres
   tienen trabajo pendiente, eso es UNA subida, no tres.

   La agrupación es por UBICACIÓN, no por gabinete ni por tren. Un manlift se
   posiciona en un sitio y desde ahí se alcanza lo que hay alrededor; dos
   equipos de la misma zona comparten posicionamiento.

   NO se agrupa lo que no tiene trabajo pendiente. Sería contar una subida que
   nadie ha pedido y darle a Producción un número que no corresponde a ningún
   trabajo real.
============================================================================= */

export interface CandidatoASubida {
  id: string;
  /** Zona donde se posiciona el equipo elevador. */
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  veredicto: VeredictoAcceso;
  /** ¿Hay una OM o una incidencia abierta sobre este equipo? */
  tienePendiente: boolean;
}

export interface Subida {
  ubicacionId: string | null;
  ubicacionNombre: string;
  equipos: number;
}

export interface ResumenDeAcceso {
  total: number;
  /** Declarados y confirmados como que exigen elevador. */
  exigenElevador: number;
  subidaSinElevador: number;
  aPie: number;
  sinDeclarar: number;
  /**
   * De los sin declarar, cuántos cuelgan de una zona marcada de altura.
   * Es el número que dice cuánto puede crecer `exigenElevador` cuando alguien
   * termine de declarar. Se enseña aparte para no mezclarlo con lo confirmado.
   */
  sinDeclararEnZonaDeAltura: number;
  /** Equipos que exigen elevador Y tienen trabajo pendiente hoy. */
  pendientesConElevador: number;
  /** Esos mismos, agrupados por dónde se posiciona el equipo. */
  subidas: Subida[];
  /** Cuántas subidas se ahorran juntando los trabajos. 0 si no hay nada que juntar. */
  subidasQueSeAhorran: number;
  contradicciones: number;
  /** El titular, redactado aquí para que sea idéntico en pantalla y en PDF. */
  titular: string;
}

export function resumirAcceso(
  filas: Array<{ acceso: Acceso; candidato: CandidatoASubida }>,
): ResumenDeAcceso {
  const r: ResumenDeAcceso = {
    total: filas.length,
    exigenElevador: 0,
    subidaSinElevador: 0,
    aPie: 0,
    sinDeclarar: 0,
    sinDeclararEnZonaDeAltura: 0,
    pendientesConElevador: 0,
    subidas: [],
    subidasQueSeAhorran: 0,
    contradicciones: 0,
    titular: '',
  };

  const porUbicacion = new Map<string, Subida>();

  for (const { acceso, candidato } of filas) {
    if (acceso.contradiccion) r.contradicciones++;

    switch (acceso.veredicto) {
      case 'EXIGE_ELEVADOR': r.exigenElevador++; break;
      case 'SUBIDA_SIN_ELEVADOR': r.subidaSinElevador++; break;
      case 'A_PIE': r.aPie++; break;
      case 'SIN_DECLARAR':
        r.sinDeclarar++;
        if (acceso.propuesta) r.sinDeclararEnZonaDeAltura++;
        break;
    }

    if (acceso.veredicto !== 'EXIGE_ELEVADOR' || !candidato.tienePendiente) continue;

    r.pendientesConElevador++;
    /* La clave es el id de ubicación. Los que no tienen ubicación cargada NO se
       meten todos en el mismo saco: cada uno cuenta como su propia subida,
       porque no hay forma de saber si están cerca. Meterlos juntos daría un
       ahorro que no existe. */
    const clave = candidato.ubicacionId ?? `sin-ubicacion-${candidato.id}`;
    const ya = porUbicacion.get(clave);
    if (ya) ya.equipos++;
    else {
      porUbicacion.set(clave, {
        ubicacionId: candidato.ubicacionId,
        ubicacionNombre: candidato.ubicacionNombre || 'Sin ubicación cargada',
        equipos: 1,
      });
    }
  }

  r.subidas = [...porUbicacion.values()].sort((a, b) => b.equipos - a.equipos);
  r.subidasQueSeAhorran = Math.max(r.pendientesConElevador - r.subidas.length, 0);
  r.titular = titularDeAcceso(r);
  return r;
}

/**
 * El titular. Una sola frase, y la que más le importa a quien la lee.
 *
 * El orden de las ramas es el orden en que Producción necesita enterarse:
 * primero si hay algo que juntar (ahorra dinero hoy), después si el dato está
 * incompleto (el número de arriba todavía puede crecer), y sólo al final la
 * foto tranquila.
 */
function titularDeAcceso(r: ResumenDeAcceso): string {
  if (r.total === 0) return 'Todavía no hay equipos cargados en este tren.';

  if (r.subidasQueSeAhorran > 0) {
    return `${r.pendientesConElevador} equipos con trabajo pendiente exigen manlift, `
      + `y están en ${r.subidas.length} ${r.subidas.length === 1 ? 'punto' : 'puntos'}: `
      + `se pueden atender en ${r.subidas.length} ${r.subidas.length === 1 ? 'subida' : 'subidas'} `
      + `en vez de ${r.pendientesConElevador}.`;
  }

  if (r.pendientesConElevador > 0) {
    return `${r.pendientesConElevador} ${r.pendientesConElevador === 1 ? 'equipo pendiente exige' : 'equipos pendientes exigen'} `
      + 'manlift. No comparten punto, así que no se pueden juntar.';
  }

  if (r.sinDeclararEnZonaDeAltura > 0) {
    return `${r.exigenElevador} ${r.exigenElevador === 1 ? 'equipo exige' : 'equipos exigen'} manlift, `
      + `pero faltan ${r.sinDeclararEnZonaDeAltura} por declarar en zonas de altura: `
      + 'esa cifra todavía puede subir.';
  }

  if (r.sinDeclarar > 0) {
    return `${r.sinDeclarar} de ${r.total} ${r.sinDeclarar === 1 ? 'equipo no tiene' : 'equipos no tienen'} `
      + 'declarado cómo se llega. Hasta que se declare no se puede planificar una subida.';
  }

  return r.exigenElevador > 0
    ? `${r.exigenElevador} de ${r.total} equipos exigen manlift, y ninguno tiene trabajo pendiente hoy.`
    : `Los ${r.total} equipos de este tren se alcanzan sin equipo elevador.`;
}
