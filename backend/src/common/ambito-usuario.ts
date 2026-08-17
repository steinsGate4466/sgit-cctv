/**
 * ÁMBITO DEL USUARIO: a qué trenes puede mirar.
 *
 * =============================================================================
 *  SE LEE DE LA BASE, NO DEL TOKEN
 * =============================================================================
 *  Es una consulta minúscula por petición. A cambio, cuando el ingeniero cambia
 *  el ámbito de alguien, el cambio vale AL INSTANTE. Si viviera en el token,
 *  esa persona seguiría viendo lo que ya no debe hasta que volviese a entrar:
 *  ocho horas después, o mañana.
 *
 * =============================================================================
 *  BLOQUE 42 — EL VACÍO DEJA DE SIGNIFICAR «TODO» PARA QUIEN NO DEBE VERLO TODO
 * =============================================================================
 *  ANTES había dos estados y el vacío era «todos los trenes». El motivo era
 *  bueno: el día del despliegue todos los usuarios existentes tienen el ámbito
 *  vacío, y si el vacío significara «ninguno», la planta entera se queda a
 *  ciegas. Restringir es una decisión que alguien toma, no el efecto secundario
 *  de una migración.
 *
 *  Pero eso convirtió un DATO QUE FALTA en PERMISO TOTAL, que es exactamente el
 *  fallo que este proyecto persigue en todas partes. Se vio en planta: un
 *  usuario de Producción con las tres pestañas de tren delante, viendo las
 *  incidencias de líneas que no son la suya. En Aceros Arequipa eso no es ruido
 *  en pantalla: es información que sale de su área.
 *
 *  AHORA HAY TRES ESTADOS, y quién tiene cada uno lo decide el ROL:
 *
 *    TODO         · el rol no exige ámbito (Jefe de Mantenimiento, TI).
 *                   El vacío sigue queriendo decir «todo» para ellos, así que
 *                   nadie pierde acceso al desplegar.
 *
 *    SUS_TRENES   · tiene trenes asignados. Ve ésos.
 *
 *    NINGUNO      · el rol EXIGE ámbito y nadie se lo asignó. No ve nada, y la
 *                   pantalla lo dice con todas las letras. Falla hacia el lado
 *                   seguro, igual que la intervenibilidad del bloque 28.
 *
 * =============================================================================
 *  POR QUÉ SE ELIMINÓ `sinLimite` EN VEZ DE AÑADIR UN CAMPO AL LADO
 * =============================================================================
 *  Había CATORCE sitios en NUEVE archivos leyendo `sinLimite`. Añadir un tercer
 *  campo junto al booleano habría compilado sin una queja y habría dejado esos
 *  catorce sitios tratando NINGUNO como si fuera «tiene trenes» — es decir, el
 *  agujero seguiría abierto en trece de ellos y yo creyendo que lo cerré.
 *
 *  Quitando el booleano, TypeScript rompe en los catorce y me obliga a visitar
 *  uno por uno. Buscar con grep es lo que se me escapa; el compilador no se
 *  distrae.
 *
 *  Y de paso: cada uno de esos sitios reimplementaba la comparación a su
 *  manera. Unos exactos, otros por subcadena — y por subcadena, un ámbito de
 *  «T1» alcanza también al «T10». Ahora todos pasan por `alcanza()`.
 */
import { PrismaService } from '../prisma/prisma.service';
import { filtroDeUbicaciones } from './ambito-planta';

export type Alcance = 'TODO' | 'SUS_TRENES' | 'NINGUNO';

export interface AmbitoResuelto {
  /** Los trenes que puede ver. Vacío con alcance TODO significa «todos». */
  trenes: string[];
  alcance: Alcance;
  /**
   * Por qué no ve nada, ya redactado. Se devuelve desde aquí para que las
   * ocho pantallas afectadas digan exactamente lo mismo en vez de que cada
   * una se invente su frase.
   */
  motivo: string | null;
}

export const SIN_TREN_ASIGNADO =
  'Todavía no tienes un tren asignado, así que no hay nada que enseñarte. '
  + 'Pídele al ingeniero de mantenimiento que te asigne tu tren en la pantalla '
  + 'de Usuarios.';

export function veTodo(a: AmbitoResuelto): boolean { return a.alcance === 'TODO'; }
export function noVeNada(a: AmbitoResuelto): boolean { return a.alcance === 'NINGUNO'; }

/**
 * ¿Este tren entra en el ámbito? La ÚNICA forma correcta de preguntarlo.
 *
 * Acepta tanto el código completo (`AASA-PISCO-T2`) como el corto (`T2`),
 * porque el ámbito se ha guardado de las dos maneras según quién lo cargara.
 * Lo que NO hace es comparar por subcadena suelta: con `includes('T1')` el
 * ámbito del Tren 1 alcanzaría a un futuro Tren 10. Se exige que coincida
 * entero o que venga precedido de un guion, que es como separan los códigos.
 */
export function alcanza(a: AmbitoResuelto, trenCode: string | null | undefined): boolean {
  if (a.alcance === 'NINGUNO') return false;
  if (a.alcance === 'TODO') return true;
  if (!trenCode) return false;

  const code = trenCode.toUpperCase();
  return a.trenes.some((t) => {
    const suyo = (t || '').toUpperCase();
    if (!suyo) return false;
    return code === suyo || code.endsWith(`-${suyo}`) || suyo.endsWith(`-${code}`);
  });
}

export async function ambitoDelUsuario(
  prisma: PrismaService,
  userId: string | null | undefined,
): Promise<AmbitoResuelto> {
  /* Sin usuario identificado se devuelve TODO. No es un agujero: a este punto
     sólo se llega detrás del guard de autenticación, y las llamadas internas
     (informes, tareas programadas) no tienen persona detrás a la que limitar. */
  if (!userId) return { trenes: [], alcance: 'TODO', motivo: null };

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { ambitoTrenes: true, role: { select: { exigeAmbito: true } } },
  });

  const trenes = (u?.ambitoTrenes ?? []).filter(Boolean);
  if (trenes.length) return { trenes, alcance: 'SUS_TRENES', motivo: null };

  /* AQUÍ ESTÁ TODO EL BLOQUE 42, EN UNA LÍNEA.
     Sin trenes asignados, lo que decide es el ROL: al administrador el vacío
     le sigue dando la planta entera; al jefe de tren no le da nada. */
  return u?.role?.exigeAmbito
    ? { trenes: [], alcance: 'NINGUNO', motivo: SIN_TREN_ASIGNADO }
    : { trenes: [], alcance: 'TODO', motivo: null };
}

/**
 * Cruza lo que PIDE la pantalla con lo que el usuario TIENE PERMITIDO.
 *
 * Manda siempre lo más restrictivo. Si el jefe del Tren 2 escribe a mano
 * `?tren=T1` en la dirección, no ve el Tren 1: ve vacío. Un filtro de pantalla
 * no puede ampliar un permiso — sería la forma más tonta de saltárselo, y la
 * primera que alguien probaría.
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
 * con el ámbito del usuario. `{ in: [] }` significa «nada», nunca «todo»: ese
 * es el fallo clásico de este tipo de filtros y aquí está cerrado.
 */
export async function filtroConAmbito(
  prisma: PrismaService,
  userId: string | null | undefined,
  ambitoPedido: { tren?: string | null; etapa?: string | null } | null | undefined,
): Promise<{ in: string[] } | null> {
  const ambito = await ambitoDelUsuario(prisma, userId);

  // Rol sectorizado sin tren asignado: ni una fila. Antes este caso no existía
  // y caía en la rama de «sin límite», que devolvía la planta entera.
  if (noVeNada(ambito)) return { in: [] };
  if (veTodo(ambito)) return filtroDeUbicaciones(prisma, ambitoPedido ?? {});

  const { trenes } = ambito;
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
