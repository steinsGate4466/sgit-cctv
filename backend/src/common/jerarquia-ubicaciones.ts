import { BadRequestException } from '@nestjs/common';

/* =============================================================================
   DE QUÉ PUEDE COLGAR UNA UBICACIÓN — bloque 172
   -----------------------------------------------------------------------------
   El desplegable «Pertenece a» ofrecía TODAS las ubicaciones, incluida
   cualquiera que cuelga de la que se está editando. Elegir una hija como padre
   hace un círculo: la ubicación y su rama desaparecen de todos los árboles y
   listas, y nadie entiende dónde se fueron. Tampoco tiene sentido un tren
   colgando de una sala.

   Regla: el padre es de nivel MENOR que el hijo. El servidor lo comprueba
   aunque la pantalla ya filtre (la pantalla es comodidad; esto es la regla).
============================================================================= */
const NIVEL: Record<string, number> = {
  EMPRESA: 0, PLANTA: 1, TREN: 2, AREA: 3, ETAPA: 3, SALA: 4, ZONA: 5, RACK: 6,
};

export function puedeColgarDe(tipoHijo: string, tipoPadre: string): boolean {
  const h = NIVEL[tipoHijo]; const p = NIVEL[tipoPadre];
  if (h === undefined || p === undefined) return true; // tipo desconocido: no se bloquea a ciegas
  return p < h;
}

const NOMBRE: Record<string, string> = {
  EMPRESA: 'una empresa', PLANTA: 'una planta', TREN: 'un tren', AREA: 'un área',
  ETAPA: 'un área del tren', SALA: 'una sala', ZONA: 'una zona', RACK: 'un gabinete',
};

export function exigirPadreValido(tipoHijo: string, tipoPadre: string): void {
  if (!puedeColgarDe(tipoHijo, tipoPadre)) {
    throw new BadRequestException(
      `${(NOMBRE[tipoHijo] ?? tipoHijo).replace(/^./, (c) => c.toUpperCase())} no puede colgar de ${NOMBRE[tipoPadre] ?? tipoPadre}: el padre tiene que ser de un nivel mayor.`,
    );
  }
}

/** ¿Elegir `nuevoPadre` como padre de `id` haría un círculo? */
export function haceCirculo(id: string, nuevoPadre: string, padreDe: Map<string, string | null>): boolean {
  const vistos = new Set<string>();
  for (let x: string | null | undefined = nuevoPadre; x; x = padreDe.get(x)) {
    if (x === id) return true;
    if (vistos.has(x)) return true;
    vistos.add(x);
  }
  return false;
}
