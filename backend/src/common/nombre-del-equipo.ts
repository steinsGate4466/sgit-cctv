import { PrismaService } from '../prisma/prisma.service';

/**
 * AUDITORÍA 20/10 · «¿DESDE QUÉ EQUIPO ENTRÓ?»
 * =============================================================================
 * El servidor vive en Railway: a él le llega la IP PÚBLICA de la planta, y
 * toda la planta sale por la misma (NAT). Con la IP sola, «quién está dentro»
 * dice veinte veces la misma dirección. Lo que distingue un PC de otro es:
 *
 *   1. el IDENTIFICADOR DE APARATO que manda el navegador (`X-Dispositivo`),
 *      al que el Jefe le pone nombre en «Equipos conocidos»
 *      («PC púlpito T2», «Celular de Juan»);
 *   2. si no lo tiene, el EQUIPO CONOCIDO cuya IP coincide (sirve dentro de
 *      la red, o con IP fija).
 *
 * La MAC no: un servidor web no la ve nunca (ver common/origen.ts).
 * Si no hay nombre, `null`: la pantalla dice «sin nombre» y ofrece ponérselo.
 * Nunca falla: es un dato para leer, no un control.
 */
export async function nombreDelEquipo(
  prisma: PrismaService,
  ip: string | null | undefined,
  dispositivoId: string | null | undefined,
): Promise<string | null> {
  try {
    if (dispositivoId) {
      const d = await prisma.dispositivoAutorizado.findUnique({
        where: { dispositivoId },
        select: { nombre: true, equipoConocido: { select: { nombre: true } } },
      });
      const n = d?.nombre || d?.equipoConocido?.nombre;
      if (n) return n.slice(0, 120);
    }
    if (ip && /^[0-9a-f.:]+$/i.test(ip)) {
      const e = await prisma.equipoConocido.findUnique({ where: { ip }, select: { nombre: true } });
      if (e?.nombre) return e.nombre.slice(0, 120);
    }
  } catch { /* sin nombre: se enseña el navegador */ }
  return null;
}

/** Lo mismo, en lote, para pintar una lista sin una consulta por fila. */
export async function nombresDeEquipos(
  prisma: PrismaService,
  filas: { ip?: string | null; dispositivoId?: string | null }[],
): Promise<{ porAparato: Map<string, string>; porIp: Map<string, string> }> {
  const ids = [...new Set(filas.map((f) => f.dispositivoId).filter(Boolean) as string[])];
  const ips = [...new Set(filas.map((f) => f.ip).filter((x) => !!x && /^[0-9a-f.:]+$/i.test(x)) as string[])];
  const porAparato = new Map<string, string>();
  const porIp = new Map<string, string>();
  try {
    const [ds, es] = await Promise.all([
      ids.length
        ? prisma.dispositivoAutorizado.findMany({
            where: { dispositivoId: { in: ids } },
            select: { dispositivoId: true, nombre: true, equipoConocido: { select: { nombre: true } } },
          })
        : [],
      ips.length
        ? prisma.equipoConocido.findMany({ where: { ip: { in: ips } }, select: { ip: true, nombre: true } })
        : [],
    ]);
    for (const d of ds as any[]) {
      const n = d.nombre || d.equipoConocido?.nombre;
      if (n) porAparato.set(d.dispositivoId, n);
    }
    for (const e of es as any[]) if (e.ip && e.nombre) porIp.set(e.ip, e.nombre);
  } catch { /* la lista se pinta igual */ }
  return { porAparato, porIp };
}

/**
 * Apunta el aparato en el registro AL ENTRAR, esté como esté el modo de
 * acceso. Antes sólo se apuntaba con el modo en AVISAR o ESTRICTO, así que
 * con el modo LIBRE (el de fábrica) no había aparato al que ponerle nombre y
 * «Quién está dentro» no podía decir nunca qué PC era. Apuntarlo no bloquea
 * nada: el modo sigue decidiendo eso. Nunca falla.
 */
export async function apuntarAparato(
  prisma: PrismaService,
  dispositivoId: string | null | undefined,
  datos: { ip?: string | null; navegador?: string | null; usuarioId?: string | null },
): Promise<void> {
  if (!dispositivoId) return;
  try {
    const previo = await prisma.dispositivoAutorizado.findUnique({
      where: { dispositivoId }, select: { ipsVistas: true, vistas: true },
    });
    if (!previo) {
      await prisma.dispositivoAutorizado.create({
        data: {
          dispositivoId,
          userAgent: datos.navegador?.slice(0, 200) || null,
          ultimaIp: datos.ip || null,
          ipsVistas: datos.ip || null,
          usuarioId: datos.usuarioId || null,
        },
      });
      return;
    }
    let ips = previo.ipsVistas || '';
    if (datos.ip && !ips.split(',').includes(datos.ip)) {
      ips = [datos.ip, ...ips.split(',').filter(Boolean)].slice(0, 5).join(',');
    }
    await prisma.dispositivoAutorizado.update({
      where: { dispositivoId },
      data: {
        ultimoVistoEn: new Date(), vistas: previo.vistas + 1,
        ultimaIp: datos.ip || undefined, ipsVistas: ips || undefined,
        usuarioId: datos.usuarioId || undefined,
        userAgent: datos.navegador?.slice(0, 200) || undefined,
      },
    });
  } catch { /* un dato para leer: no puede tumbar el login */ }
}
