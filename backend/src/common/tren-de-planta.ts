import { BadRequestException } from '@nestjs/common';

/* =============================================================================
   EL «TREN» DE PARADAS, INSTALACIONES, TABLEROS, SUBREDES Y CAMPAÑAS — bloque 172
   -----------------------------------------------------------------------------
   EL FALLO, y es de los que no se ven hasta que alguien lo intenta:

   Esas cinco tablas guardan el tren como el enum `PlantTrain`
   (TREN_1, TREN_2, TREN_3, PATIO, PLANTA_GENERAL). Los desplegables mandaban
   «T1», «T2», «T3». Prisma lo rechazaba y la pantalla decía «Datos inválidos».

   Consecuencia real, comprobada contra la base:
     · NO SE PODÍA APUNTAR NINGUNA PARADA (el tren es obligatorio): siempre 400.
     · Instalaciones, tableros, subredes y campañas sólo se guardaban si se
       dejaba el tren en «No aplica» — por eso todas las filas tienen tren vacío.
     · Filtrar esas listas por tren devolvía error.

   Aquí se normaliza TODO lo que llega —«T1», «TREN_1», «AASA-PISCO-T1»,
   «Tren 1»— al valor del enum, en un solo sitio. Lo que no es un tren de
   planta se rechaza con un mensaje que dice qué valores valen.
============================================================================= */

export const TRENES_DE_PLANTA = ['TREN_1', 'TREN_2', 'TREN_3', 'PATIO', 'PLANTA_GENERAL'] as const;
export type TrenDePlanta = typeof TRENES_DE_PLANTA[number];

/** Lo que aceptan los DTO: el enum y la forma corta de siempre. */
export const TRENES_ACEPTADOS: string[] = [...TRENES_DE_PLANTA, 'T1', 'T2', 'T3'];

/** Sin tren → `null`. Ausente → `undefined` (no tocar). Lo demás, al enum. */
export function aTrenDePlanta(v: unknown): TrenDePlanta | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === '') return null;
  const s = String(v).trim().toUpperCase();
  if ((TRENES_DE_PLANTA as readonly string[]).includes(s)) return s as TrenDePlanta;
  const n = s.match(/(?:^|[^A-Z])T(?:REN)?[\s_-]*([123])\s*(?:\(|$)/) || s.match(/^T([123])$/);
  if (n) return `TREN_${n[1]}` as TrenDePlanta;
  if (/OFICINA|PLANTA[\s_-]*GENERAL|-OFI$/.test(s)) return 'PLANTA_GENERAL';
  if (/PATIO|ALMAC|EXTERIOR/.test(s)) return 'PATIO';
  throw new BadRequestException(
    `«${String(v)}» no es un tren de planta. Vale: Tren 1, Tren 2, Tren 3, Patio o Planta general.`,
  );
}

/** Para un filtro: si no se reconoce, se ignora en vez de romper la lista. */
export function filtroDeTrenDePlanta(v: unknown): TrenDePlanta | undefined {
  try { return aTrenDePlanta(v) ?? undefined; } catch { return undefined; }
}
