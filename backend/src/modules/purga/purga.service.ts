import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * PURGA — BORRADO DEFINITIVO PARA LIMPIAR BASURA (bloque 15).
 *
 * ===========================================================================
 *  LA DECISIÓN DE DISEÑO: SON DOS OPERACIONES, NO UNA
 * ===========================================================================
 *
 *  BAJA (lo que ya existía, `assets.remove`)
 *    El equipo EXISTIÓ y se retiró de planta. Se marca `deletedAt` y pasa a
 *    BAJA. Su historial de mantenimiento SE CONSERVA, porque ese historial
 *    es la respuesta a "¿cuántas veces falló esa cámara antes de cambiarla?"
 *    Es lo correcto el 99 % de las veces.
 *
 *  PURGA (esto)
 *    El registro NUNCA DEBIÓ EXISTIR: un `ewaeweaw` de pruebas, un duplicado,
 *    un código mal tecleado. No hay historial que conservar porque no hubo
 *    equipo. Se borra de verdad, con todo lo que cuelgue.
 *
 *  Confundirlas es el error caro: purgar un equipo real borra el historial
 *  que costó meses juntar, y dar de baja un registro de pruebas deja basura
 *  para siempre en los listados de "activos en BAJA".
 *
 * ===========================================================================
 *  LA REGLA QUE PROTEGE DE LA CONFUSIÓN
 * ===========================================================================
 *
 *  **Si el registro tiene rastro de trabajo REAL, NO se purga.**
 *
 *  Una orden CERRADA lleva firma de quien la cerró, materiales retirados del
 *  almacén y a veces un informe en PDF. Eso es un documento con valor de
 *  auditoría: no se borra porque a alguien le estorbe en una lista. Si un
 *  equipo tiene órdenes cerradas, ES un equipo real → Baja, no purga.
 *
 *  Basura de pruebas no tiene órdenes cerradas. Nunca. Por eso esta regla
 *  distingue las dos cosas sin preguntarle a nadie.
 *
 * ===========================================================================
 *  POR QUÉ SE EXIGE EL ROL Y NO SÓLO EL PERMISO
 * ===========================================================================
 *
 *  `asset.delete` es un permiso, y un permiso se puede otorgar por error al
 *  crear un rol. Borrar definitivamente es irreversible, así que además se
 *  comprueba que quien lo pide ES **Jefe de Mantenimiento**. Dos llaves para
 *  la puerta que no tiene vuelta.
 */

const ROL_QUE_PUEDE_PURGAR = 'Jefe de Mantenimiento';

@Injectable()
export class PurgaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Dos llaves: el permiso lo comprueba el guard; el ROL, aquí. */
  private async exigirJefe(userId?: string | null) {
    if (!userId) throw new ForbiddenException('Sesión no válida.');
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, role: { select: { name: true } } },
    });
    if (!u?.active || u.role?.name !== ROL_QUE_PUEDE_PURGAR) {
      throw new ForbiddenException(
        `El borrado definitivo lo hace únicamente el ${ROL_QUE_PUEDE_PURGAR}. ` +
        `No basta con tener el permiso: es una operación sin vuelta atrás.`,
      );
    }
  }

  /* ==================== ACTIVOS ==================== */

  /**
   * QUÉ SE VA A LLEVAR POR DELANTE. Se consulta ANTES de borrar y se
   * enseña en la pantalla, para que la decisión se tome viendo el precio.
   */
  async vistaPreviaActivo(id: string) {
    const a = await this.prisma.asset.findUnique({
      where: { id },
      select: {
        id: true, assetCode: true, type: true, status: true, deletedAt: true,
        createdAt: true, referencePlace: true,
        _count: {
          select: {
            workOrders: true, incidents: true, documents: true, photos: true,
            history: true, credentials: true, portsOnSwitch: true,
            linksA: true, linksB: true, accessRequests: true,
            inspeccionesGrua: true,
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Ese activo no existe.');

    // Las órdenes CERRADAS son el freno: llevan firma y materiales.
    const cerradas = await this.prisma.workOrder.count({
      where: { assetId: id, status: 'CERRADA' },
    });

    const c = a._count;
    const arrastra = [
      { que: 'órdenes de mantenimiento', n: c.workOrders },
      { que: 'incidencias', n: c.incidents },
      { que: 'documentos (manuales, planos)', n: c.documents },
      { que: 'fotos', n: c.photos },
      { que: 'registros de historial', n: c.history },
      { que: 'credenciales guardadas', n: c.credentials },
      { que: 'puertos de switch declarados', n: c.portsOnSwitch },
      { que: 'enlaces de red', n: c.linksA + c.linksB },
      { que: 'permisos de altura', n: c.accessRequests },
      { que: 'inspecciones de grúa', n: c.inspeccionesGrua },
    ].filter((x) => x.n > 0);

    return {
      activo: {
        id: a.id, code: a.assetCode, tipo: a.type as string,
        estado: a.status as string, lugar: a.referencePlace,
        yaEstaDeBaja: !!a.deletedAt,
        creado: a.createdAt,
      },
      arrastra,
      totalArrastrado: arrastra.reduce((s, x) => s + x.n, 0),
      ordenesCerradas: cerradas,
      // La pantalla usa esto para enseñar el camino correcto en vez de un
      // botón que va a fallar.
      sePuedePurgar: cerradas === 0,
      motivoSiNo: cerradas > 0
        ? `Este equipo tiene ${cerradas} orden(es) CERRADA(S), con firma y materiales retirados. ` +
          `Eso es trabajo real documentado y no se borra. Si el equipo salió de planta, usa «Dar de baja»: ` +
          `desaparece de los listados activos y conserva su historial.`
        : null,
    };
  }

  /**
   * Purga de verdad. Exige que quien la pide escriba el código del activo:
   * es lo que evita el clic accidental en la fila equivocada.
   */
  async purgarActivo(id: string, confirmacion: string, userId?: string | null, ip?: string | null) {
    await this.exigirJefe(userId);

    const previa = await this.vistaPreviaActivo(id);
    if (!previa.sePuedePurgar) throw new BadRequestException(previa.motivoSiNo!);

    if ((confirmacion || '').trim().toUpperCase() !== previa.activo.code.toUpperCase()) {
      throw new BadRequestException(
        `Para borrar definitivamente hay que escribir el código exacto: ${previa.activo.code}. ` +
        `Esto existe para que no se borre la fila de al lado por un clic.`,
      );
    }

    /* SE AUDITA ANTES DE BORRAR, NO DESPUÉS.
       Si se anotara después y el borrado fallara a medias, quedaría un
       registro diciendo que se borró algo que sigue ahí. Y si se borra bien
       pero falla la auditoría, al menos ya está escrito lo que se iba a
       hacer. El orden importa. */
    await this.audit.record({
      userId: userId || null, action: 'PURGE_ASSET', entity: 'assets', entityId: id, ip,
      before: {
        code: previa.activo.code,
        tipo: previa.activo.tipo,
        arrastrado: previa.arrastra,
        total: previa.totalArrastrado,
      },
    });

    /* El borrado en cascada lo hace PostgreSQL con las claves foráneas ya
       declaradas (`onDelete: Cascade`). No se borra a mano tabla por tabla:
       hacerlo así olvidaría alguna el día que se añada una relación nueva,
       y la base quedaría con filas apuntando a un activo que ya no existe. */
    await this.prisma.asset.delete({ where: { id } });

    return { ok: true, code: previa.activo.code, arrastrado: previa.totalArrastrado };
  }

  /** Los candidatos obvios a limpieza: sin trabajo real y recién creados. */
  async candidatosBasura() {
    const activos = await this.prisma.asset.findMany({
      select: {
        id: true, assetCode: true, type: true, status: true, createdAt: true,
        referencePlace: true, locationId: true, deletedAt: true,
        _count: { select: { workOrders: true, incidents: true, history: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return activos
      .filter((a) => a._count.workOrders === 0 && a._count.incidents === 0)
      .map((a) => {
        const razones: string[] = [];
        if (!a.locationId) razones.push('sin ubicación');
        if (a._count.history === 0) razones.push('sin historial');
        // Un código que no sigue el patrón AA-XXX-... suele ser tecleo de prueba.
        if (!/^AA-[A-Z]{2,4}-/i.test(a.assetCode)) razones.push('código fuera de patrón');
        return {
          id: a.id, code: a.assetCode, tipo: a.type as string,
          estado: a.status as string, lugar: a.referencePlace,
          creado: a.createdAt, yaEstaDeBaja: !!a.deletedAt,
          razones,
          // Cuantas más señales, más probable que sea basura. Es una PISTA
          // para ordenar la lista, no un juicio: la decisión la toma la
          // persona mirando el código.
          sospecha: razones.length,
        };
      })
      .sort((a, b) => b.sospecha - a.sospecha || (a.code > b.code ? 1 : -1));
  }

  /* ==================== USUARIOS ==================== */

  async vistaPreviaUsuario(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, fullName: true, active: true,
        role: { select: { name: true } },
        _count: {
          select: {
            auditLogs: true, sesiones: true,
          },
        },
      },
    });
    if (!u) throw new NotFoundException('Ese usuario no existe.');

    /* Un usuario que FIRMÓ algo no se borra: su nombre está en órdenes
       cerradas, en aprobaciones de trabajo en altura y en retiros de
       almacén. Borrarlo dejaría documentos firmados por nadie, y eso es
       peor que tener una cuenta desactivada en la lista. */
    const [cerro, aprobo, asignadas] = await Promise.all([
      this.prisma.workOrder.count({ where: { closedById: id } }),
      this.prisma.accessRequest.count({ where: { reviewedById: id } }).catch(() => 0),
      this.prisma.workOrder.count({ where: { technicianId: id } }),
    ]);
    const firmas = cerro + aprobo;

    return {
      usuario: {
        id: u.id, email: u.email, nombre: u.fullName,
        activo: u.active, rol: u.role?.name ?? null,
      },
      firmas,
      ordenesAsignadas: asignadas,
      registrosAuditoria: u._count.auditLogs,
      sesiones: u._count.sesiones,
      sePuedePurgar: firmas === 0,
      motivoSiNo: firmas > 0
        ? `Esta persona firmó ${firmas} documento(s): órdenes cerradas o autorizaciones de altura. ` +
          `Borrarla dejaría documentos firmados por nadie. Desactívala en su lugar: no puede entrar, ` +
          `y su nombre sigue respaldando lo que firmó.`
        : null,
    };
  }

  async purgarUsuario(id: string, confirmacion: string, userId?: string | null, ip?: string | null) {
    await this.exigirJefe(userId);
    if (id === userId) throw new BadRequestException('No puedes borrarte a ti mismo.');

    const previa = await this.vistaPreviaUsuario(id);
    if (!previa.sePuedePurgar) throw new BadRequestException(previa.motivoSiNo!);

    if ((confirmacion || '').trim().toLowerCase() !== previa.usuario.email.toLowerCase()) {
      throw new BadRequestException(
        `Para borrar definitivamente hay que escribir el correo exacto: ${previa.usuario.email}`,
      );
    }

    // Que no quede el sistema sin administrador.
    if (previa.usuario.rol === ROL_QUE_PUEDE_PURGAR) {
      const otros = await this.prisma.user.count({
        where: { active: true, id: { not: id }, role: { name: ROL_QUE_PUEDE_PURGAR } },
      });
      if (otros === 0) {
        throw new BadRequestException(
          `Es el único ${ROL_QUE_PUEDE_PURGAR} activo. Borrarlo dejaría el sistema sin nadie que pueda administrarlo.`,
        );
      }
    }

    await this.audit.record({
      userId: userId || null, action: 'PURGE_USER', entity: 'users', entityId: id, ip,
      before: { email: previa.usuario.email, nombre: previa.usuario.nombre, rol: previa.usuario.rol },
    });

    await this.prisma.user.delete({ where: { id } });
    return { ok: true, email: previa.usuario.email };
  }

  /* ==================== AUDITORÍA ==================== */

  /**
   * PURGA DE AUDITORÍA — la más delicada de las tres.
   *
   * La auditoría es el registro de quién hizo qué. Borrarla es exactamente lo
   * que haría alguien para tapar algo, así que lleva tres frenos:
   *
   *   1. NUNCA se puede borrar lo RECIENTE. Mínimo 90 días de antigüedad.
   *      Si se pudiera borrar lo de hoy, la auditoría no serviría para nada.
   *   2. La purga QUEDA REGISTRADA en la propia auditoría, con cuántas filas
   *      se borraron y desde qué fecha. El agujero se ve.
   *   3. Nunca se borran los registros de PURGA anteriores. Esa cadena no se
   *      rompe.
   */
  async vistaPreviaAuditoria(antesDe: string) {
    const fecha = new Date(antesDe);
    if (isNaN(fecha.getTime())) throw new BadRequestException('Fecha no válida.');

    const HACE_90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    if (fecha > HACE_90) {
      throw new BadRequestException(
        'Sólo se puede depurar auditoría de más de 90 días. Poder borrar lo reciente ' +
        'convertiría la auditoría en un adorno.',
      );
    }

    const total = await this.prisma.auditLog.count({
      where: { createdAt: { lt: fecha }, action: { notIn: ['PURGE_ASSET', 'PURGE_USER', 'PURGE_AUDIT'] } },
    });
    const masAntiguo = await this.prisma.auditLog.findFirst({
      where: { createdAt: { lt: fecha } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    return {
      antesDe: fecha,
      total,
      masAntiguo: masAntiguo?.createdAt ?? null,
      // Se dice explícitamente lo que NO se toca.
      seConservan: 'Los registros de purgas anteriores nunca se borran: esa cadena no se rompe.',
    };
  }

  async purgarAuditoria(antesDe: string, confirmacion: string, userId?: string | null, ip?: string | null) {
    await this.exigirJefe(userId);
    const previa = await this.vistaPreviaAuditoria(antesDe);

    if ((confirmacion || '').trim().toUpperCase() !== 'DEPURAR AUDITORIA') {
      throw new BadRequestException('Escribe exactamente: DEPURAR AUDITORIA');
    }
    if (previa.total === 0) throw new BadRequestException('No hay nada que depurar antes de esa fecha.');

    // Se anota ANTES: así el hueco queda explicado dentro de la propia
    // auditoría, con quién lo hizo y cuánto borró.
    await this.audit.record({
      userId: userId || null, action: 'PURGE_AUDIT', entity: 'audit_logs', entityId: null, ip,
      before: { antesDe: previa.antesDe, filas: previa.total },
    });

    const r = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: previa.antesDe },
        action: { notIn: ['PURGE_ASSET', 'PURGE_USER', 'PURGE_AUDIT'] },
      },
    });
    return { ok: true, borrados: r.count };
  }
}
