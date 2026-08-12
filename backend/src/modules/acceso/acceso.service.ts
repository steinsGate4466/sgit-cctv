import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * CONTROL DE ACCESO POR DISPOSITIVO (bloque 18)
 * =============================================================================
 *
 *  «QUE SÓLO PUEDAN ENTRAR LOS EQUIPOS QUE YO DIGA»
 *  --------------------------------------------------------------------------
 *  Se puede. Pero antes hay que quitar de en medio dos ideas que suenan bien
 *  y no funcionan, porque construirlas sería venderte humo:
 *
 *  1. **POR MAC: IMPOSIBLE.** La MAC es de capa 2 y muere en el primer
 *     router. Al servidor le llega la del gateway, la misma para toda la
 *     planta. El filtrado por MAC existe, pero se hace **en el switch**
 *     (802.1X o port-security), no en una aplicación web. Cualquier software
 *     que diga que filtra por MAC desde el navegador está mintiendo.
 *
 *  2. **POR IP: SÓLO A MEDIAS.** Sirve para la red de planta, que sale por
 *     una IP pública fija: ahí sí se puede decir "sólo desde dentro". Pero
 *     **no sirve para los técnicos con datos móviles**: el operador les
 *     cambia la IP constantemente (CGNAT). Un filtro estricto por IP dejaría
 *     fuera justo a la gente que está en la nave levantando cámaras.
 *
 *  LO QUE SÍ FUNCIONA: EL DISPOSITIVO
 *  --------------------------------------------------------------------------
 *  El navegador se presenta con un identificador estable (`X-Dispositivo`)
 *  que sobrevive al cambio de red. El Jefe aprueba los aparatos una vez, y
 *  los que no están aprobados no entran. Eso sí contesta la pregunta.
 *
 *  NO ES INFALIBLE y está tratado como lo que es: **una capa más** sobre la
 *  contraseña y el token, no un sustituto. Quien tenga acceso al navegador de
 *  un aparato aprobado puede copiar el identificador.
 *
 * =============================================================================
 *  LOS TRES MODOS, Y POR QUÉ SE EMPIEZA POR EL DE EN MEDIO
 * =============================================================================
 *
 *   LIBRE     Nadie comprueba nada. Es como está hoy.
 *
 *   AVISAR    Se APUNTAN los aparatos que entran, y no se bloquea a nadie.
 *             **Aquí se empieza siempre.** Dejas pasar una semana, miras la
 *             lista, apruebas los que reconoces, y sólo entonces cierras.
 *             Encender el modo estricto sin esto es quedarse fuera el lunes
 *             a las seis de la mañana con la planta parada.
 *
 *   ESTRICTO  Sólo entran los APROBADOS.
 *
 *  Y TRES SEGUROS PARA NO QUEDARTE FUERA, que son la parte que de verdad
 *  importa de este diseño:
 *
 *   · Si NO HAY NINGÚN dispositivo aprobado, el modo estricto **no bloquea**.
 *     Una lista blanca vacía que bloquea todo es una puerta cerrada con la
 *     llave dentro.
 *   · El **login nunca se bloquea**. Si no, no habría forma de entrar a
 *     desactivarlo.
 *   · La variable de entorno `ACCESO_DISPOSITIVO_OFF=1` lo apaga sin tocar la
 *     base. Es el martillo para romper el cristal.
 */

export const CLAVE_MODO = 'ACCESO_MODO';
export type ModoAcceso = 'LIBRE' | 'AVISAR' | 'ESTRICTO';

@Injectable()
export class AccesoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Se cachea: esto se consulta en CADA petición del sistema. */
  private modoCache: { valor: ModoAcceso; hasta: number } = { valor: 'LIBRE', hasta: 0 };

  async modo(): Promise<ModoAcceso> {
    if (process.env.ACCESO_DISPOSITIVO_OFF === '1') return 'LIBRE';
    if (Date.now() < this.modoCache.hasta) return this.modoCache.valor;
    try {
      const c = await this.prisma.configuracionSistema.findUnique({ where: { clave: CLAVE_MODO } });
      const v = (c?.valor as ModoAcceso) || 'LIBRE';
      this.modoCache = { valor: v, hasta: Date.now() + 30_000 };
      return v;
    } catch {
      // Si la configuración no se puede leer, NO se bloquea a nadie.
      return 'LIBRE';
    }
  }

  async cambiarModo(valor: ModoAcceso, userId?: string | null, ip?: string | null) {
    if (!['LIBRE', 'AVISAR', 'ESTRICTO'].includes(valor)) {
      throw new BadRequestException('Modo no válido.');
    }
    if (valor === 'ESTRICTO') {
      const aprobados = await this.prisma.dispositivoAutorizado.count({ where: { estado: 'APROBADO' } });
      if (aprobados === 0) {
        throw new BadRequestException(
          'No hay ningún dispositivo aprobado todavía. Encender el modo estricto ahora ' +
          'te dejaría fuera a ti también. Pon primero el modo AVISAR, deja pasar unos ' +
          'días, aprueba los aparatos que reconozcas, y entonces ciérralo.',
        );
      }
    }
    await this.prisma.configuracionSistema.upsert({
      where: { clave: CLAVE_MODO },
      create: { clave: CLAVE_MODO, valor, descripcion: 'LIBRE | AVISAR | ESTRICTO', actualizadoPor: userId || null },
      update: { valor, actualizadoEn: new Date(), actualizadoPor: userId || null },
    });
    this.modoCache = { valor, hasta: 0 };
    await this.audit.record({ userId, action: 'UPDATE', entity: 'acceso', entityId: CLAVE_MODO, ip, after: { modo: valor } });
    return { ok: true, modo: valor };
  }

  /**
   * Registra que un aparato se ha visto. Se llama en cada petición, así que
   * está escrito para ser barato: un `upsert` y nada más.
   *
   * Devuelve el estado para que el guard decida.
   */
  async registrarVisto(dispositivoId: string, datos: { ip?: string | null; userAgent?: string | null; usuarioId?: string | null }) {
    try {
      const previo = await this.prisma.dispositivoAutorizado.findUnique({
        where: { dispositivoId },
        select: { id: true, estado: true, ipsVistas: true, vistas: true },
      });

      if (!previo) {
        const nuevo = await this.prisma.dispositivoAutorizado.create({
          data: {
            dispositivoId,
            userAgent: datos.userAgent?.slice(0, 200) || null,
            ultimaIp: datos.ip || null,
            ipsVistas: datos.ip || null,
            usuarioId: datos.usuarioId || null,
          },
          select: { estado: true },
        });
        return nuevo.estado;
      }

      // Se guardan hasta 5 IP distintas: con eso ya se distingue un PC fijo
      // de un celular que salta de wifi a datos. Guardarlas todas sería una
      // columna que crece sin límite y no dice nada más.
      let ips = previo.ipsVistas || '';
      if (datos.ip && !ips.split(',').includes(datos.ip)) {
        const lista = [datos.ip, ...ips.split(',').filter(Boolean)].slice(0, 5);
        ips = lista.join(',');
      }

      await this.prisma.dispositivoAutorizado.update({
        where: { dispositivoId },
        data: {
          ultimoVistoEn: new Date(),
          vistas: previo.vistas + 1,
          ultimaIp: datos.ip || undefined,
          ipsVistas: ips || undefined,
          usuarioId: datos.usuarioId || undefined,
        },
      });
      return previo.estado;
    } catch {
      // Si esto falla, NO se bloquea. Es una capa, no la puerta.
      return 'APROBADO' as const;
    }
  }

  async listar(estado?: string) {
    return this.prisma.dispositivoAutorizado.findMany({
      where: estado ? { estado: estado as any } : undefined,
      orderBy: [{ estado: 'asc' }, { ultimoVistoEn: 'desc' }],
      take: 300,
      include: { equipoConocido: { select: { id: true, nombre: true, ubicacion: true } } },
    });
  }

  async decidir(id: string, estado: 'APROBADO' | 'BLOQUEADO' | 'PENDIENTE', datos: { nombre?: string; equipoConocidoId?: string; motivo?: string }, userId?: string | null, ip?: string | null) {
    const d = await this.prisma.dispositivoAutorizado.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Ese dispositivo no existe.');

    const r = await this.prisma.dispositivoAutorizado.update({
      where: { id },
      data: {
        estado,
        nombre: datos.nombre?.trim() || d.nombre,
        equipoConocidoId: datos.equipoConocidoId || d.equipoConocidoId,
        motivo: datos.motivo?.trim() || null,
        aprobadoPorId: userId || null,
        aprobadoEn: new Date(),
      },
    });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'acceso', entityId: id, ip,
      after: { dispositivo: d.dispositivoId, estado, nombre: r.nombre },
    });
    return r;
  }

  /** Lo que la pantalla necesita para explicar en qué situación está. */
  async resumen() {
    const [modo, porEstado, total] = await Promise.all([
      this.modo(),
      this.prisma.dispositivoAutorizado.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.dispositivoAutorizado.count(),
    ]);
    const cuenta = Object.fromEntries(porEstado.map((e) => [e.estado as string, e._count._all]));
    return {
      modo,
      total,
      aprobados: cuenta.APROBADO ?? 0,
      pendientes: cuenta.PENDIENTE ?? 0,
      bloqueados: cuenta.BLOQUEADO ?? 0,
      // El seguro: sin aprobados, el estricto no bloquea aunque esté puesto.
      estrictoEfectivo: modo === 'ESTRICTO' && (cuenta.APROBADO ?? 0) > 0,
      apagadoPorEntorno: process.env.ACCESO_DISPOSITIVO_OFF === '1',
    };
  }
}
