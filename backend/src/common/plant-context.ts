// =============================================================================
//  Contexto de planta DERIVADO — Laminación (F8)
//
//  Igual que en F5 con el estado del activo: una sola fuente de verdad.
//  Antes existían DOS jerarquías en competencia —el árbol de ubicaciones y el
//  campo Asset.train—, y nada impedía que se contradijeran. Aquí el tren, la
//  etapa del proceso, el ambiente, la criticidad y el intervalo preventivo se
//  CALCULAN subiendo el árbol de ubicaciones.
//
//  Reglas:
//    · Tren      -> ancestro de tipo TREN.
//    · Etapa     -> ancestro más cercano de tipo ETAPA (con su catálogo).
//    · Ambiente  -> el de la ubicación si lo declara; si no, el de la etapa.
//    · Criticidad-> la MAYOR entre la del activo y la mínima de la etapa.
//                   Se puede elevar a mano, nunca bajar por debajo de la etapa.
//    · Intervalo -> días según el ambiente (tabla INTERVALO_POR_AMBIENTE).
//
//  Rendimiento: 2 consultas por lote (ubicaciones + etapas). No hay N+1.
// =============================================================================
import { PrismaService } from '../prisma/prisma.service';

export type Criticidad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export type Ambiente =
  | 'CALOR_RADIANTE'
  | 'VAPOR_AGUA'
  | 'POLVO_METALICO'
  | 'INTEMPERIE_SALINA'
  | 'EMI_ALTA'
  | 'CLIMATIZADO';

/** Orden de severidad. Permite comparar criticidades sin encadenar ifs. */
const ORDEN_CRITICIDAD: Record<Criticidad, number> = {
  BAJA: 0,
  MEDIA: 1,
  ALTA: 2,
  CRITICA: 3,
};

/**
 * Intervalo preventivo en días según el AMBIENTE.
 *
 * Sustituye al binario "zona crítica sí/no", que dependía del criterio de
 * quien registró el activo. Lo que degrada el equipo es el ambiente:
 * el calor radiante del horno destruye sellos y óptica; la salinidad de la
 * costa de Pisco corroe; el púlpito climatizado casi no exige nada.
 *
 * Es el punto de partida: el plan preventivo de cada activo puede editarse.
 */
export const INTERVALO_POR_AMBIENTE: Record<Ambiente, number> = {
  CALOR_RADIANTE: 30,
  VAPOR_AGUA: 30,
  POLVO_METALICO: 45,
  INTEMPERIE_SALINA: 45,
  EMI_ALTA: 60,
  CLIMATIZADO: 90,
};

/** Intervalo usado cuando aún no se conoce el ambiente (activo sin etapa). */
export const INTERVALO_POR_DEFECTO = 60;

export interface ContextoDePlanta {
  /** Código del tren (ej. AASA-PISCO-T2) o null si el activo no cuelga de uno. */
  trenCode: string | null;
  trenNombre: string | null;
  /** Código de etapa (ej. DESBASTE) o null si falta asignarla. */
  etapaCode: string | null;
  etapaNombre: string | null;
  /** Orden dentro del proceso; sirve para dibujar el tren de izquierda a derecha. */
  etapaSecuencia: number | null;
  ambiente: Ambiente | null;
  criticidad: Criticidad;
  intervaloDias: number;
  // ---- Lo que declaró PRODUCCIÓN sobre la zona (bloque 26) ----
  /// Criticidad que Producción puso a la zona más cercana que la declare.
  /// null = ninguna zona de la rama tiene declaración.
  criticidadProduccion: Criticidad | null;
  /// Atajo para pintar la etiqueta: la zona pesa para producción.
  zonaVital: boolean;
  /// Nombre de la zona que aporta la criticidad, para poder decir de dónde
  /// sale. Sin esto, el técnico ve «CRÍTICA» y no sabe por qué.
  zonaCriticaNombre: string | null;
  porQueEsVital: string | null;
  impactoSiSeCae: string | null;
  queSeVigila: string | null;
  /// true si la declaración caducó. No se ignora —seguiría siendo temerario—
  /// pero se marca para que alguien la confirme.
  declaracionVencida: boolean;
  /**
   * true cuando el activo todavía no tiene etapa asignada. La migración NO
   * inventa la etapa de las cámaras porque ningún dato existente permite
   * saber a qué apunta una cámara: eso lo sabe el técnico que la instaló.
   */
  requiereAsignarEtapa: boolean;
}

interface ActivoLike {
  id: string;
  criticality?: string | null;
  locationId?: string | null;
}

/** Devuelve la criticidad mayor entre dos. */
export function criticidadMayor(a: Criticidad, b: Criticidad): Criticidad {
  return ORDEN_CRITICIDAD[a] >= ORDEN_CRITICIDAD[b] ? a : b;
}

/** Intervalo preventivo sugerido para un ambiente dado. */
export function intervaloParaAmbiente(ambiente?: Ambiente | null): number {
  if (!ambiente) return INTERVALO_POR_DEFECTO;
  return INTERVALO_POR_AMBIENTE[ambiente] ?? INTERVALO_POR_DEFECTO;
}

/* ---------------------------------------------------------------------------
   NÚCLEO PURO
   ---------------------------------------------------------------------------
   Lo que sigue no sabe que existe Prisma. Recibe el árbol ya cargado y
   devuelve el contexto. Se hizo así por una razón práctica: la regla de
   «qué criticidad gana» es la que decide el orden en que se atienden las
   cámaras de la planta, y una regla así hay que poder probarla caso por caso
   con datos escritos a mano, no levantando una base de datos.
--------------------------------------------------------------------------- */

/** Una ubicación del árbol, con lo justo para calcular. */
export interface UbicacionDelArbol {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  stageId?: string | null;
  environment?: string | null;
  criticidadProduccion?: string | null;
  porQueEsVital?: string | null;
  impactoSiSeCae?: string | null;
  queSeVigila?: string | null;
  revisarAntesDe?: Date | null;
}

/** Una etapa del catálogo de proceso. */
export interface EtapaDelCatalogo {
  id: string;
  code: string;
  name: string;
  sequence: number;
  environment?: string | null;
  baseCriticality: string;
}

/**
 * Calcula el contexto de UN activo subiendo el árbol.
 *
 * @param ahora  milisegundos. Se pasa desde fuera para que dos activos del
 *               mismo listado no puedan caer a distinto lado de una fecha de
 *               caducidad, y para poder probar el vencimiento sin esperar.
 */
export function calcularContexto(
  activo: ActivoLike,
  porId: Map<string, UbicacionDelArbol>,
  etapaPorId: Map<string, EtapaDelCatalogo>,
  ahora: number,
): ContextoDePlanta {
  const base = (activo.criticality || 'MEDIA') as Criticidad;

  const ctx: ContextoDePlanta = {
    trenCode: null, trenNombre: null,
    etapaCode: null, etapaNombre: null, etapaSecuencia: null,
    ambiente: null,
    criticidad: base,
    intervaloDias: INTERVALO_POR_DEFECTO,
    criticidadProduccion: null,
    zonaVital: false,
    zonaCriticaNombre: null,
    porQueEsVital: null,
    impactoSiSeCae: null,
    queSeVigila: null,
    declaracionVencida: false,
    requiereAsignarEtapa: true,
  };

  // El tope de 20 saltos protege ante un ciclo por dato corrupto: sin él, un
  // parentId mal grabado colgaría el proceso entero.
  let actual = activo.locationId ? porId.get(activo.locationId) : undefined;
  let ambienteLocal: Ambiente | null = null;
  let saltos = 0;

  while (actual && saltos < 20) {
    // El ambiente declarado en la ubicación MÁS CERCANA manda sobre el de la
    // etapa (caso real: cámara dentro de un cofre refrigerado en plena zona
    // de calor).
    if (!ambienteLocal && actual.environment) {
      ambienteLocal = actual.environment as Ambiente;
    }

    /* LO QUE DIJO PRODUCCIÓN, de la zona MÁS CERCANA que lo diga.
       Si el Tren 2 entero está declarado ALTA pero el foso del lecho está
       declarado CRÍTICA, la cámara del foso es CRÍTICA: lo específico manda
       sobre lo general, que es como lo diría una persona.

       Y sólo SUBE la criticidad, nunca la baja. Una zona declarada MEDIA no
       puede rebajar una cámara que Mantenimiento marcó ALTA por motivos
       técnicos: son dos criterios distintos y los dos valen. */
    if (!ctx.criticidadProduccion && actual.criticidadProduccion) {
      const zonal = actual.criticidadProduccion as Criticidad;
      ctx.criticidadProduccion = zonal;
      ctx.zonaCriticaNombre = actual.name;
      ctx.porQueEsVital = actual.porQueEsVital ?? null;
      ctx.impactoSiSeCae = actual.impactoSiSeCae ?? null;
      ctx.zonaVital = zonal === 'ALTA' || zonal === 'CRITICA';
      ctx.declaracionVencida =
        !!actual.revisarAntesDe && actual.revisarAntesDe.getTime() < ahora;
      ctx.criticidad = criticidadMayor(ctx.criticidad, zonal);
    }
    // Qué se ve desde aquí: también la zona más cercana que lo tenga escrito,
    // aunque no sea la misma que aporta la criticidad.
    if (!ctx.queSeVigila && actual.queSeVigila) {
      ctx.queSeVigila = actual.queSeVigila;
    }

    if (actual.type === 'ETAPA' && !ctx.etapaCode && actual.stageId) {
      const etapa = etapaPorId.get(actual.stageId);
      if (etapa) {
        ctx.etapaCode = etapa.code;
        ctx.etapaNombre = etapa.name;
        ctx.etapaSecuencia = etapa.sequence;
        ctx.requiereAsignarEtapa = false;
        if (!ambienteLocal) ambienteLocal = etapa.environment as Ambiente;
        // Se compara contra lo YA acumulado, no contra `base`: si dijera
        // `base`, la etapa PISARÍA la criticidad que aportó la zona de
        // Producción unos saltos más abajo.
        ctx.criticidad = criticidadMayor(
          ctx.criticidad,
          etapa.baseCriticality as Criticidad,
        );
      }
    }

    if (actual.type === 'TREN' && !ctx.trenCode) {
      ctx.trenCode = actual.code;
      ctx.trenNombre = actual.name;
    }

    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
    saltos++;
  }

  ctx.ambiente = ambienteLocal;
  ctx.intervaloDias = intervaloParaAmbiente(ambienteLocal);
  return ctx;
}

/**
 * Calcula el contexto de planta de un lote de activos.
 * Devuelve un mapa assetId -> ContextoDePlanta.
 */
export async function resolverContextoDePlanta(
  prisma: PrismaService,
  activos: ActivoLike[],
): Promise<Record<string, ContextoDePlanta>> {
  const resultado: Record<string, ContextoDePlanta> = {};
  if (!activos.length) return resultado;
  // Una sola lectura del reloj para todo el lote: si se leyera dentro del
  // bucle, dos activos del mismo lote podrían caer a distinto lado de una
  // fecha de caducidad y el listado se contradiría consigo mismo.
  const ahora = Date.now();

  // --- Consulta 1: TODAS las ubicaciones (el árbol de planta es pequeño:
  //     decenas de filas, no cientos de miles). Traerlo entero evita subir el
  //     árbol con una consulta por nivel, que sería el clásico N+1.
  const ubicaciones = await prisma.location.findMany({
    select: {
      id: true, code: true, name: true, type: true,
      parentId: true, stageId: true, environment: true,
      // Bloque 26 — lo que declaró Producción sobre la zona.
      criticidadProduccion: true, porQueEsVital: true,
      impactoSiSeCae: true, queSeVigila: true, revisarAntesDe: true,
    },
  });
  // `as const` es necesario: sin él TypeScript infiere un array en lugar de
  // una tupla [clave, valor] y el Map queda mal tipado.
  const porId = new Map(ubicaciones.map((u) => [u.id, u] as const));

  // --- Consulta 2: catálogo de etapas.
  const etapas = await prisma.processStage.findMany({
    select: {
      id: true, code: true, name: true, sequence: true,
      environment: true, baseCriticality: true, defaultIntervalDays: true,
    },
  });
  const etapaPorId = new Map(etapas.map((e) => [e.id, e] as const));

  for (const activo of activos) {
    resultado[activo.id] = calcularContexto(
      activo,
      porId as Map<string, UbicacionDelArbol>,
      etapaPorId as Map<string, EtapaDelCatalogo>,
      ahora,
    );
  }

  return resultado;
}

/** Versión de conveniencia para un solo activo. */
export async function resolverContexto(
  prisma: PrismaService,
  activo: ActivoLike,
): Promise<ContextoDePlanta> {
  const mapa = await resolverContextoDePlanta(prisma, [activo]);
  return mapa[activo.id];
}
