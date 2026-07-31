import { PrismaService } from '../prisma/prisma.service';

// ============================================================================
//  ÁMBITO DE PLANTA — traducir "Tren 2" o "etapa Desbaste" a un filtro real.
//
//  EL PROBLEMA
//  El tren y la etapa NO son columnas del activo: se DERIVAN del árbol de
//  ubicaciones. Filtrar por tren no puede ser `where: { train: 'TREN_2' }`
//  porque esa columna quedó obsoleta a propósito.
//
//  CÓMO SE RESUELVE
//  El árbol se recorre UNA vez hacia abajo desde el nodo del tren (o de la
//  etapa) y se obtiene el conjunto de ubicaciones que cuelgan de él. Después
//  basta con `locationId: { in: [...] }`, que la base resuelve con índice.
//
//  Se hace así y no resolviendo el contexto de cada activo porque el árbol
//  tiene decenas de filas y los activos son cientos: se filtra por el lado
//  barato.
// ============================================================================

export interface NodoUbicacion {
  id: string;
  parentId: string | null;
  type: string;
  code: string;
  stageId?: string | null;
}

/**
 * Todos los descendientes de un conjunto de nodos, incluidos ellos mismos.
 *
 * Función PURA para poder probarla sin base de datos. Lleva tope de vueltas
 * porque un árbol con un ciclo (A hijo de B, B hijo de A) colgaría el
 * servidor: el dato lo escriben personas y un ciclo es un error posible.
 */
export function descendientes(nodos: NodoUbicacion[], raices: string[]): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const n of nodos) {
    if (!n.parentId) continue;
    if (!hijos.has(n.parentId)) hijos.set(n.parentId, []);
    hijos.get(n.parentId)!.push(n.id);
  }

  const dentro = new Set<string>();
  const pila = [...raices];
  let vueltas = 0;
  const TOPE = nodos.length + raices.length + 10;

  while (pila.length) {
    if (++vueltas > TOPE) break; // guardia de ciclo
    const id = pila.pop()!;
    if (dentro.has(id)) continue;
    dentro.add(id);
    for (const h of hijos.get(id) || []) pila.push(h);
  }
  return dentro;
}

/** Nodos raíz que corresponden al ámbito pedido. */
export function raicesDelAmbito(
  nodos: NodoUbicacion[],
  ambito: { tren?: string | null; etapa?: string | null },
  etapaIdPorCodigo?: Map<string, string>,
): string[] | null {
  const { tren, etapa } = ambito;
  if (!tren && !etapa) return null; // sin filtro

  // Sin etapa: el nodo del tren.
  if (tren && !etapa) {
    return nodos.filter((n) => n.type === 'TREN' && n.code === tren).map((n) => n.id);
  }

  const stageId = etapa ? etapaIdPorCodigo?.get(etapa) : undefined;
  let etapas = nodos.filter((n) => n.type === 'ETAPA' && !!n.stageId && n.stageId === stageId);

  // Con tren Y etapa: solo las instancias de esa etapa que cuelgan de ese tren.
  // Una misma etapa (ej. DESBASTE) existe en los tres trenes: sin acotar por
  // tren se mezclarían los tres, que es justo lo que este filtro evita.
  if (tren) {
    const idsDelTren = descendientes(
      nodos,
      nodos.filter((n) => n.type === 'TREN' && n.code === tren).map((n) => n.id),
    );
    etapas = etapas.filter((n) => idsDelTren.has(n.id));
  }
  return etapas.map((n) => n.id);
}

/**
 * Devuelve el fragmento de `where` de Prisma para acotar por tren y/o etapa.
 *
 * - Sin ámbito: `null` (el llamador no añade nada).
 * - Ámbito válido: `{ in: [...ids] }`.
 * - Ámbito que no existe: `{ in: [] }`, que NO devuelve nada. Es intencionado:
 *   pedir "Tren 9" debe devolver vacío, no la planta entera. Un filtro que
 *   falla en silencio y muestra todo es peor que un filtro que muestra nada.
 */
export async function filtroDeUbicaciones(
  prisma: PrismaService,
  ambito: { tren?: string | null; etapa?: string | null },
): Promise<{ in: string[] } | null> {
  if (!ambito?.tren && !ambito?.etapa) return null;

  const nodos = await prisma.location.findMany({
    select: { id: true, parentId: true, type: true, code: true, stageId: true },
  });

  let etapaIdPorCodigo: Map<string, string> | undefined;
  if (ambito.etapa) {
    const etapas = await prisma.processStage.findMany({ select: { id: true, code: true } });
    etapaIdPorCodigo = new Map(etapas.map((e) => [e.code, e.id] as const));
  }

  const raices = raicesDelAmbito(nodos as NodoUbicacion[], ambito, etapaIdPorCodigo);
  if (raices === null) return null;
  return { in: [...descendientes(nodos as NodoUbicacion[], raices)] };
}
