/* =============================================================================
   CUMPLIMIENTO NORMATIVO — indicador ⑤ del ingeniero · bloque 78
   =============================================================================

   QUÉ CONTESTA, y por qué no es «otro porcentaje más»:

       Si mañana viene una auditoría, ¿qué es lo que NO vamos a poder enseñar?

   El cumplimiento del preventivo dice si las rutinas se hicieron a tiempo.
   Esto dice otra cosa: si lo que se hizo **está documentado como exige la
   norma**. Un trabajo hecho y sin firmar, para una auditoría, no se hizo.

   -----------------------------------------------------------------------------
   POR QUÉ SE MIDE CONTRA REGLAS Y NO CONTRA UN NÚMERO GLOBAL

   Un «85 % de cumplimiento» no sirve para nada: nadie sabe qué hacer con él.
   Lo que se necesita es la LISTA de lo que falta, y por eso cada regla devuelve
   su propio recuento y sus propios incumplidores.

   -----------------------------------------------------------------------------
   LAS REGLAS SALEN DE LO QUE YA EXIGE EL PROPIO SISTEMA

   No se inventa una norma nueva. Cada regla de aquí es una obligación que este
   proyecto YA declaró en su día, en su bloque, por un motivo escrito:

     · la zona crítica sin motivo escrito      → bloque 26
     · la intervención sin firmar              → bloque 28
     · la declaración de zona caducada         → bloque 26
     · la orden cerrada sin causa de catálogo  → bloque 3F-1
     · el equipo sin acceso declarado          → bloque 41 (SSOMA)
     · el equipo A/B/C sin clasificar          → bloque 76

   Inventar aquí requisitos que el sistema no pide daría un indicador que nadie
   puede poner en verde, y un indicador imposible se deja de mirar.
============================================================================= */

/** Una regla incumplida, con lo justo para ir a arreglarla. */
export interface Incumplimiento {
  /** Identificador estable de la regla, para poder filtrar por él. */
  regla: string;
  /** Qué exige, en castellano. Es lo que se pinta. */
  exige: string;
  /** Por qué se exige. Sin esto, una regla parece burocracia. */
  porque: string;
  /** Cuántos registros la incumplen. */
  cuantos: number;
  /** Cuántos deberían cumplirla (el denominador). */
  deTotal: number;
  /** Dónde se arregla. Sin esto el indicador es un reproche, no una tarea. */
  donde: string;
  /** Los primeros que fallan, para poder empezar por algo. */
  ejemplos: string[];
}

export interface EntradaCumplimiento {
  zonas: {
    id: string;
    nombre: string;
    criticidadProduccion: string | null;
    porQueEsVital: string | null;
    intervencionFirmada: string | null;
    revisarAntesDe: Date | null;
    tieneActivos: boolean;
  }[];
  ordenesCerradas: {
    code: string;
    tipo: string;
    rootCause: string | null;
  }[];
  activos: {
    assetCode: string;
    medioAcceso: string | null;
    letraAbc: string | null;
  }[];
  /** Para saber si una declaración caducó. Se pasa para poder probarlo. */
  ahora?: Date;
}

const EJEMPLOS = 5;

/**
 * Evalúa las seis reglas y devuelve sólo las que se incumplen.
 *
 * LAS QUE SE CUMPLEN NO SE DEVUELVEN. Una lista donde el 80 % de las líneas
 * dicen «bien» esconde las que dicen «mal», y a la tercera vez que se abre ya
 * nadie la lee entera. El porcentaje global se calcula igualmente para poder
 * pintar la tendencia.
 */
export function cumplimientoNormativo(e: EntradaCumplimiento): {
  pct: number | null;
  cumplidas: number;
  totalReglas: number;
  hallazgos: Incumplimiento[];
} {
  const ahora = e.ahora ?? new Date();
  const hallazgos: Incumplimiento[] = [];
  let totalReglas = 0;

  const anotar = (
    regla: string, exige: string, porque: string, donde: string,
    fallan: string[], deTotal: number,
  ) => {
    totalReglas++;
    /* Si no hay a quién aplicarle la regla, NO cuenta como cumplida ni como
       incumplida: se salta. Contarla cumplida inflaría el porcentaje con
       reglas que no se han probado, que es la forma más fácil de que un
       indicador diga que todo va bien sin haber mirado nada. */
    if (deTotal === 0) { totalReglas--; return; }
    if (!fallan.length) return;
    hallazgos.push({
      regla, exige, porque, donde,
      cuantos: fallan.length,
      deTotal,
      ejemplos: fallan.slice(0, EJEMPLOS),
    });
  };

  // ---- 1. Zona crítica sin motivo escrito (bloque 26) ----
  const criticas = e.zonas.filter(
    (z) => z.criticidadProduccion === 'ALTA' || z.criticidadProduccion === 'CRITICA',
  );
  anotar(
    'zona-sin-motivo',
    'Toda zona declarada Alta o Crítica lleva escrito por qué lo es.',
    'Sin esa frase, en unos meses todas las zonas son críticas y la clasificación deja de ordenar nada.',
    'Ubicaciones → la zona → Importancia',
    criticas.filter((z) => !z.porQueEsVital?.trim()).map((z) => z.nombre),
    criticas.length,
  );

  // ---- 2. Zona con equipos y sin intervención firmada (bloque 28) ----
  const conActivos = e.zonas.filter((z) => z.tieneActivos);
  anotar(
    'zona-sin-firma',
    'Toda zona con equipos tiene firmado cómo se interviene.',
    'Sin firma el sistema exige parada de tren, y eso frena trabajos que podrían hacerse en marcha.',
    'Ubicaciones → la zona → Cómo se interviene',
    conActivos.filter((z) => !z.intervencionFirmada).map((z) => z.nombre),
    conActivos.length,
  );

  // ---- 3. Declaración caducada (bloque 26) ----
  const conFecha = e.zonas.filter((z) => z.revisarAntesDe);
  anotar(
    'declaracion-caducada',
    'Las declaraciones de zona se revisan antes de su fecha.',
    'La planta cambia. Una criticidad de 2026 aplicada en 2029 es una mentira con fecha.',
    'Ubicaciones → la zona → Importancia',
    conFecha.filter((z) => z.revisarAntesDe! < ahora).map((z) => z.nombre),
    conFecha.length,
  );

  // ---- 4. Orden cerrada sin causa de catálogo (bloque 3F-1) ----
  const correctivas = e.ordenesCerradas.filter((o) => o.tipo === 'CORRECTIVO');
  anotar(
    'orden-sin-causa',
    'Toda orden correctiva cerrada declara su causa raíz.',
    'Sin causa no se puede contar qué falla más, y sin eso no hay forma de justificar un repuesto.',
    'Órdenes → la orden → Cerrar',
    correctivas.filter((o) => !o.rootCause?.trim()).map((o) => o.code),
    correctivas.length,
  );

  // ---- 5. Equipo sin acceso declarado (bloque 41 · SSOMA) ----
  anotar(
    'acceso-sin-declarar',
    'Todo equipo tiene declarado cómo se llega a él.',
    'Es lo que decide si hace falta manlift o arnés. Subir sin saberlo es el accidente que este campo existe para evitar.',
    'Activos → la ficha → Cómo se llega',
    e.activos.filter((a) => !a.medioAcceso).map((a) => a.assetCode),
    e.activos.length,
  );

  // ---- 6. Equipo sin criticidad A/B/C (bloque 76) ----
  anotar(
    'sin-criticidad',
    'Todo equipo tiene su letra A/B/C.',
    'Sin letra no entra en el plan: nadie sabe cada cuánto revisarlo, y no se revisa.',
    'Criticidad A/B/C, o de golpe en Ubicaciones → la zona',
    e.activos.filter((a) => !a.letraAbc || a.letraAbc === 'SIN_CLASIFICAR').map((a) => a.assetCode),
    e.activos.length,
  );

  if (totalReglas === 0) {
    // No hay nada cargado todavía. `null`, no 100 %: un 100 % sin datos es la
    // peor cifra posible porque nadie vuelve a mirar.
    return { pct: null, cumplidas: 0, totalReglas: 0, hallazgos: [] };
  }

  const cumplidas = totalReglas - hallazgos.length;
  return {
    pct: Number(((cumplidas / totalReglas) * 100).toFixed(1)),
    cumplidas,
    totalReglas,
    // Lo peor primero: por proporción de incumplimiento, no por número
    // absoluto. Cinco de cinco es más grave que cincuenta de cuatrocientas.
    hallazgos: hallazgos.sort((a, b) => (b.cuantos / b.deTotal) - (a.cuantos / a.deTotal)),
  };
}
