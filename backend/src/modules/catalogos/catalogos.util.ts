// ============================================================================
//  CATÁLOGOS EDITABLES — lógica pura, sin base de datos.
//
//  Se separa para poder probarla: la generación del código y el agrupado son
//  las dos cosas que, si fallan, ensucian el catálogo para siempre y no se
//  notan hasta que hay 200 filas.
// ============================================================================

/** Tipos de catálogo. Debe coincidir con el enum CatalogKind del esquema. */
export const TIPOS_CATALOGO = ['CAUSA', 'SINTOMA', 'ACCION', 'MOTIVO_AVANCE'] as const;
export type TipoCatalogo = (typeof TIPOS_CATALOGO)[number];

export const TIPO_ES: Record<string, string> = {
  CAUSA: 'Causas de cierre',
  SINTOMA: 'Síntomas observados',
  ACCION: 'Acciones realizadas',
  MOTIVO_AVANCE: 'Motivos de no avanzar',
};

/**
 * Genera el código a partir del nombre.
 *
 * POR QUÉ SE GENERA Y NO SE PIDE
 * El código es lo que se guarda en la orden y lo que permite que, si mañana se
 * corrige la redacción, el histórico no cambie de significado. Pero pedirle a
 * alguien que invente un código en mayúsculas mientras escribe un nombre es
 * pedirle dos trabajos, y el segundo lo va a hacer mal. Se deriva del nombre y
 * se puede corregir a mano si hace falta.
 *
 *   "Cable dañado (cortado, aplastado)"  ->  CABLE_DANADO_CORTADO_APLASTADO
 */
export function codigoDesdeNombre(nombre: string): string {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // fuera acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')       // todo lo demás, separador
    .replace(/^_+|_+$/g, '')           // sin guiones al principio ni al final
    .slice(0, 40);                      // techo: un código largo no se lee
}

export interface ItemCatalogo {
  id?: string;
  code: string;
  name: string;
  group?: string | null;
  sequence?: number | null;
  active?: boolean;
}

/**
 * Agrupa por familia y ordena.
 *
 * Con 17 opciones en una lista plana, dentro de un teléfono y con la parada
 * corriendo, el técnico elige la primera que ve. Agrupadas se encuentran.
 * Lo que no tiene familia va al final, en "Otros": esconderlo sería peor.
 */
export function agruparItems(items: ItemCatalogo[]) {
  const grupos = new Map<string, ItemCatalogo[]>();
  for (const i of items) {
    const g = (i.group || '').trim() || 'Otros';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(i);
  }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.name.localeCompare(b.name));
  }
  return [...grupos.entries()]
    .map(([grupo, opciones]) => ({ grupo, opciones }))
    .sort((a, b) => {
      if (a.grupo === 'Otros') return 1;   // "Otros" siempre al final
      if (b.grupo === 'Otros') return -1;
      return a.grupo.localeCompare(b.grupo);
    });
}

/** Comprueba lo que no puede pasar. Devuelve el motivo, o null si está bien. */
export function motivoInvalido(item: { name?: string; code?: string }): string | null {
  const nombre = (item.name || '').trim();
  if (!nombre) return 'El nombre es obligatorio.';
  if (nombre.length > 120) return 'El nombre es demasiado largo (máximo 120).';

  const code = (item.code || '').trim();
  // Puede venir vacío: se genera del nombre. Lo que no puede es quedarse vacío
  // DESPUÉS de generarlo, y eso pasa si el nombre solo tiene signos.
  const codigoFinal = code || codigoDesdeNombre(nombre);
  if (!codigoFinal) return 'Del nombre no sale ningún código. Usa letras o números.';
  if (!/^[A-Z0-9_]+$/.test(codigoFinal)) {
    return 'El código solo admite letras mayúsculas, números y guion bajo.';
  }
  return null;
}
