/**
 * ÁMBITO DEL USUARIO: a qué trenes puede mirar.
 *
 * Lo pidió Producción: el jefe de línea del Tren 2 ve SU tren y nada más.
 *
 * DOS DECISIONES QUE MANDAN SOBRE TODO LO DEMÁS
 *
 * 1. SE LEE DE LA BASE, NO DEL TOKEN.
 *    Es una consulta minúscula por petición. A cambio, cuando el ingeniero
 *    cambia el ámbito de alguien, el cambio vale AL INSTANTE. Si viviera en
 *    el token, ese alguien seguiría viendo lo que ya no debe hasta que
 *    volviese a entrar — ocho horas después, o mañana.
 *
 * 2. ÁMBITO VACÍO = TODOS LOS TRENES.
 *    Todos los usuarios que ya existen tienen el ámbito vacío. Si el vacío
 *    significara "ninguno", el día del despliegue la planta entera se queda
 *    sin ver nada. Restringir es una decisión que alguien toma; no puede ser
 *    el efecto secundario de una migración.
 */
import { PrismaService } from '../prisma/prisma.service';
import { filtroDeUbicaciones } from './ambito-planta';

export interface AmbitoResuelto {
  /** Trenes a los que alcanza. Vacío = todos. */
  trenes: string[];
  /** true si este usuario lo ve todo. */
  sinLimite: boolean;
}

export async function ambitoDelUsuario(
  prisma: PrismaService,
  userId: string | null | undefined,
): Promise<AmbitoResuelto> {
  if (!userId) return { trenes: [], sinLimite: true };
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { ambitoTrenes: true },
  });
  const trenes = u?.ambitoTrenes ?? [];
  return { trenes, sinLimite: trenes.length === 0 };
}

/**
 * Cruza lo que PIDE la pantalla con lo que el usuario TIENE PERMITIDO.
 *
 * Manda siempre lo más restrictivo. Si el jefe del Tren 2 escribe a mano
 * `?tren=T1` en la dirección, no ve el Tren 1: ve vacío. Un filtro de
 * pantalla no puede ampliar un permiso — sería la forma más tonta de
 * saltarse el control, y la primera que alguien probaría.
 */
export function cruzarAmbito(
  pedido: string | null | undefined,
  permitido: string[],
): string | null | 'NADA' {
  if (!permitido || permitido.length === 0) return pedido ?? null;
  if (!pedido) {
    // No pidió tren: se le da el suyo. Con varios, se resuelve por lista.
    return permitido.length === 1 ? permitido[0] : null;
  }
  return permitido.includes(pedido.toUpperCase()) ? pedido : 'NADA';
}

/**
 * Filtro de ubicaciones listo para meter en un `where` de Prisma, ya cruzado
 * con el ámbito del usuario. `{ in: [] }` significa "nada", nunca "todo":
 * ese es el fallo clásico de este tipo de filtros y aquí está cerrado.
 */
export async function filtroConAmbito(
  prisma: PrismaService,
  userId: string | null | undefined,
  ambitoPedido: { tren?: string | null; etapa?: string | null } | null | undefined,
): Promise<{ in: string[] } | null> {
  const { trenes, sinLimite } = await ambitoDelUsuario(prisma, userId);
  if (sinLimite) return filtroDeUbicaciones(prisma, ambitoPedido ?? {});

  const cruce = cruzarAmbito(ambitoPedido?.tren, trenes);
  if (cruce === 'NADA') return { in: [] };

  if (cruce === null && trenes.length > 1) {
    // Varios trenes permitidos y ninguno pedido: se unen los suyos.
    const partes = await Promise.all(
      trenes.map((t) => filtroDeUbicaciones(prisma, { tren: t, etapa: ambitoPedido?.etapa })),
    );
    const ids = new Set<string>();
    for (const p of partes) (p?.in ?? []).forEach((id) => ids.add(id));
    return { in: [...ids] };
  }
  return filtroDeUbicaciones(prisma, { tren: cruce, etapa: ambitoPedido?.etapa });
}
