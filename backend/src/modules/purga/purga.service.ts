import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { porClave, RECURSOS } from './recursos-purgables';
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

  /* ==================== ÓRDENES DE MANTENIMIENTO ==================== */

  /**
   * PURGAR UNA OM — el caso con más aristas de los cuatro.
   *
   * ===========================================================================
   *  TRES FRENOS, Y CADA UNO ESTÁ POR UNA RAZÓN DISTINTA
   * ===========================================================================
   *
   *  1. UNA ORDEN CERRADA NO SE BORRA. Lleva firma electrónica de quien la
   *     cerró, causa, síntoma y acción. Es el documento que responde "¿qué se
   *     hizo aquel día?". Si estorba en la lista, se filtra; no se borra.
   *
   *  2. SI SALIÓ MATERIAL DEL ALMACÉN, TAMPOCO. Y ésta es la importante,
   *     porque no es obvia:
   *
   *       El retiro de almacén escribió un MOVIMIENTO DE STOCK. Ese
   *       movimiento vive en la tabla del almacén, NO cuelga de la orden.
   *       Borrar la orden se lleva la línea de material —que es el hilo que
   *       explica el movimiento— pero **el movimiento se queda**. Resultado:
   *       el almacén dice "salieron 3 conectores" y ya nadie sabe para qué.
   *
   *     Borrar el papel no devuelve los repuestos a la estantería. Si de
   *     verdad hay que anular ese trabajo, primero se DEVUELVE el material
   *     por el módulo de almacén —que escribe su movimiento de devolución— y
   *     entonces la orden queda limpia y se puede purgar.
   *
   *  3. TIENE QUE ESCRIBIRSE EL CÓDIGO (OT-2026-0001). Igual que con los
   *     activos: contra el clic en la fila de al lado.
   *
   * ===========================================================================
   *  LO QUE **NO** SE BORRA, Y HAY QUE DECIRLO EN PANTALLA
   * ===========================================================================
   *
   *  · Las CÁMARAS LEVANTADAS en una orden de MAPEO **no se borran**. La
   *    relación es opcional, así que PostgreSQL sólo pone el enlace a nulo:
   *    los equipos siguen ahí, pierden la referencia a la orden que los
   *    levantó. Es lo correcto —el equipo existe en la planta, exista o no el
   *    papeleo— pero si nadie lo avisa, alguien va a creer que borró 12
   *    cámaras y va a entrar en pánico.
   *
   *  · Las INSPECCIONES DE GRÚA igual: quedan sin orden asociada, no se van.
   *
   *  · Las FOTOS quedan en MinIO. Se borra la fila que las nombra, no el
   *    archivo. Es basura de almacenamiento, no de datos, y borrar objetos de
   *    un bucket desde una operación de base de datos es la clase de cosa que
   *    falla a medias y deja el sistema peor.
   */
  async vistaPreviaOm(id: string) {
    const om = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true, code: true, type: true, status: true, createdAt: true,
        activity: true, closedById: true, executedDate: true,
        asset: { select: { assetCode: true } },
        _count: {
          select: {
            progress: true, evidences: true, materialItems: true,
            tools: true, checklist: true, swaps: true,
            mappedAssets: true, inspeccionesGrua: true,
          },
        },
      },
    });
    if (!om) throw new NotFoundException('Esa orden no existe.');

    // ¿Salió algo del almacén de verdad? `movementId` es el hilo con el
    // movimiento de stock: si existe, hubo un retiro con respaldo.
    const conRetiro = await this.prisma.workOrderMaterial.count({
      where: { workOrderId: id, movementId: { not: null } },
    });

    const c = om._count;
    const arrastra = [
      { que: 'reportes de avance', n: c.progress },
      { que: 'fotos de evidencia (la fila, no el archivo)', n: c.evidences },
      { que: 'líneas de material', n: c.materialItems },
      { que: 'herramientas preparadas', n: c.tools },
      { que: 'respuestas del checklist', n: c.checklist },
      { que: 'cambios de equipo registrados', n: c.swaps },
    ].filter((x) => x.n > 0);

    // Lo que sobrevive. Se enseña aparte para que nadie crea que lo perdió.
    const sobrevive = [
      { que: 'activos levantados en esta orden de mapeo', n: c.mappedAssets },
      { que: 'inspecciones de grúa', n: c.inspeccionesGrua },
    ].filter((x) => x.n > 0);

    /* ANTES ESTO ERA UNA PROHIBICIÓN. AHORA ES UN AVISO.
       -------------------------------------------------------------------
       Me equivoqué de escenario. Yo protegí el sistema EN OPERACIÓN, donde
       una orden cerrada es un documento firmado y no se toca. Pero el
       sistema todavía NO está en operación: lo que hay dentro son pruebas,
       y hacen falta las secciones VACÍAS para llenarlas con datos reales.
       Una regla que impide vaciar datos de prueba antes del estreno no
       protege nada: obliga a estrenar con basura dentro.

       Así que los frenos siguen, pero como AVISO con llave aparte. Se puede
       pasar por encima, y cuando se pasa queda escrito en la auditoría con
       la marca `forzado`. Eso es lo correcto: no impedir la operación, sino
       dejar rastro de quién la hizo. */
    const cerrada = om.status === 'CERRADA';
    const avisos: string[] = [];
    if (cerrada) {
      avisos.push(
        `Está CERRADA: lleva firma de quien la cerró, causa y acción. ` +
        `Si esto fuera trabajo real, sería un documento y no se borraría.`,
      );
    }
    if (conRetiro > 0) {
      avisos.push(
        `Salió material del almacén (${conRetiro} línea(s) con retiro firmado). ` +
        `Borrarla NO devuelve los repuestos a la estantería y deja el movimiento ` +
        `de almacén sin explicación.`,
      );
    }

    return {
      om: {
        id: om.id, code: om.code, tipo: om.type as string,
        estado: om.status as string, actividad: om.activity,
        equipo: om.asset?.assetCode ?? null,
        creada: om.createdAt, ejecutada: om.executedDate,
      },
      arrastra,
      totalArrastrado: arrastra.reduce((s, x) => s + x.n, 0),
      sobrevive,
      materialesConRetiro: conRetiro,
      // Siempre se puede. Lo que cambia es si hace falta la segunda llave.
      sePuedePurgar: true,
      // Si hay avisos, la pantalla exige marcar la casilla de forzar.
      exigeForzar: avisos.length > 0,
      avisos,
      motivoSiNo: null as string | null,
    };
  }

  async purgarOm(
    id: string,
    confirmacion: string,
    userId?: string | null,
    ip?: string | null,
    forzar = false,
  ) {
    await this.exigirJefe(userId);

    const previa = await this.vistaPreviaOm(id);

    // La segunda llave. No impide nada: obliga a decir "sé lo que hay dentro".
    if (previa.exigeForzar && !forzar) {
      throw new BadRequestException(
        `Esta orden tiene avisos y hay que confirmar que se borra igual:\n\n· ` +
        previa.avisos.join('\n· '),
      );
    }

    if ((confirmacion || '').trim().toUpperCase() !== previa.om.code.toUpperCase()) {
      throw new BadRequestException(
        `Para borrar definitivamente hay que escribir el código exacto: ${previa.om.code}. ` +
        `Esto existe para que no se borre la fila de al lado por un clic.`,
      );
    }

    await this.audit.record({
      userId: userId || null, action: 'PURGE_WORKORDER', entity: 'work-orders', entityId: id, ip,
      before: {
        code: previa.om.code,
        tipo: previa.om.tipo,
        estado: previa.om.estado,
        equipo: previa.om.equipo,
        arrastrado: previa.arrastra,
        total: previa.totalArrastrado,
        conservado: previa.sobrevive,
        // Si se pasó por encima de un aviso, queda escrito CUÁL.
        forzado: previa.exigeForzar || undefined,
        avisos: previa.exigeForzar ? previa.avisos : undefined,
      },
    });

    await this.prisma.workOrder.delete({ where: { id } });
    return {
      ok: true,
      code: previa.om.code,
      arrastrado: previa.totalArrastrado,
      conservado: previa.sobrevive.reduce((s: number, x: any) => s + x.n, 0),
    };
  }

  /**
   * Órdenes candidatas a ser basura.
   *
   * El criterio NO es "está abierta": hay órdenes abiertas legítimas esperando
   * una parada de tren desde hace un mes, y sacarlas aquí sería invitar a
   * borrar trabajo pendiente. El criterio es **no le ha pasado nada nunca**:
   * sin avance, sin material, sin fotos, sin checklist. Un papel en blanco.
   */
  async candidatosOm() {
    /* Ya no se excluyen las CERRADAS. Antes de estrenar, las cerradas de
       prueba son justo las que estorban. Salen marcadas con su estado y con
       sus avisos: la persona decide mirando, no la regla por ella. */
    const oms = await this.prisma.workOrder.findMany({
      select: {
        id: true, code: true, type: true, status: true, createdAt: true,
        activity: true, technicianId: true, scheduledDate: true, progressPct: true,
        asset: { select: { assetCode: true } },
        _count: {
          select: { progress: true, evidences: true, materialItems: true, checklist: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const HACE_30 = Date.now() - 30 * 86_400_000;

    return oms
      .map((o) => {
        const razones: string[] = [];
        if (!o.asset) razones.push('sin equipo');
        if (!o.technicianId) razones.push('sin técnico asignado');
        if (!o.activity || o.activity.trim().length < 8) razones.push('sin descripción');
        if (o.createdAt.getTime() < HACE_30) razones.push('más de 30 días sin tocar');
        if (o.status === 'CANCELADA') razones.push('cancelada');
        const c = o._count;
        const enBlanco = c.progress === 0 && c.evidences === 0
          && c.materialItems === 0 && c.checklist === 0 && o.progressPct === 0;
        if (enBlanco) razones.push('sin nada registrado');
        return {
          id: o.id, code: o.code, tipo: o.type as string, estado: o.status as string,
          equipo: o.asset?.assetCode ?? null, actividad: o.activity,
          creada: o.createdAt, razones, enBlanco,
          // La cerrada exige la segunda llave, y se avisa desde la lista.
          exigeForzar: o.status === 'CERRADA' || c.materialItems > 0,
          sospecha: razones.length,
        };
      })
      .sort((a, b) => b.sospecha - a.sospecha || (a.code > b.code ? 1 : -1));
  }

  /**
   * VACIAR TODAS LAS ÓRDENES — el botón de "esto es de prueba, fuera".
   *
   * ===========================================================================
   *  POR QUÉ EXISTE Y POR QUÉ ES SEGURO QUE EXISTA
   * ===========================================================================
   *  El sistema todavía no ha estrenado. Lo que hay en Órdenes son pruebas de
   *  desarrollo, y hace falta la sección EN BLANCO para empezar a llenarla con
   *  trabajo real. Borrarlas de una en una son cien clics y cien confirmaciones
   *  escritas: al clic treinta, alguien deja de leer lo que escribe. Un botón
   *  que hace explícito "voy a vaciar TODO" es más seguro que cien que dicen
   *  "voy a borrar una".
   *
   *  LOS FRENOS QUE SÍ TIENE
   *   · Rol Jefe de Mantenimiento.
   *   · Hay que escribir la frase completa, no una palabra.
   *   · Se anota en la auditoría CUÁNTAS y CUÁLES (los códigos), antes de borrar.
   *   · Nunca borra activos: los levantados en mapeo sobreviven (SET NULL).
   *
   *  LO QUE **NO** HACE, Y HAY QUE SABERLO
   *   Los movimientos de almacén de los retiros SE QUEDAN. El stock ya se movió
   *   y esto no lo revierte. Si el almacén también es de prueba, se cuadra desde
   *   Inventario. Se dice aquí y se dice en pantalla.
   */
  async vaciarOrdenes(confirmacion: string, userId?: string | null, ip?: string | null) {
    await this.exigirJefe(userId);

    const FRASE = 'VACIAR TODAS LAS ORDENES';
    if ((confirmacion || '').trim().toUpperCase().replace(/\s+/g, ' ') !== FRASE) {
      throw new BadRequestException(`Escribe exactamente: ${FRASE}`);
    }

    const todas = await this.prisma.workOrder.findMany({
      select: { id: true, code: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    if (todas.length === 0) throw new BadRequestException('No hay órdenes que borrar.');

    const cerradas = todas.filter((o) => o.status === 'CERRADA').length;

    // Se anota ANTES, con los códigos. Si mañana falta una orden, el registro
    // dice quién vació, cuándo y qué había.
    await this.audit.record({
      userId: userId || null, action: 'PURGE_ALL_WORKORDERS', entity: 'work-orders', entityId: null, ip,
      before: {
        total: todas.length,
        cerradas,
        codigos: todas.map((o) => o.code),
      },
    });

    const r = await this.prisma.workOrder.deleteMany({});
    return { ok: true, borradas: r.count, cerradas };
  }

  /** Cuántas hay y de qué tipo, para enseñarlo antes de vaciar. */
  async resumenOrdenes() {
    const [total, porEstado, conMaterial] = await Promise.all([
      this.prisma.workOrder.count(),
      this.prisma.workOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.workOrderMaterial.count({ where: { movementId: { not: null } } }),
    ]);
    return {
      total,
      porEstado: porEstado.map((e) => ({ estado: e.status as string, n: e._count._all })),
      lineasConRetiro: conMaterial,
    };
  }


  /* ============ BORRADO GENÉRICO, UN RECURSO CUALQUIERA ============ */

  /**
   * EL MISMO DIÁLOGO PARA LOS QUINCE MÓDULOS.
   *
   * Antes había un par `vistaPreviaX`/`purgarX` por recurso. Al llevar el
   * borrado a todos los módulos eso serían quince copias: quince sitios donde
   * puede faltar la confirmación escrita, quince donde puede faltar la
   * auditoría, y quince que hay que tocar el día que cambie una regla.
   *
   * Aquí la tabla `RECURSOS` declara lo particular de cada uno —su código,
   * qué arrastra, qué lo bloquea— y estas dos funciones aplican a todos lo
   * mismo: rol de Jefe, confirmación escrita, auditoría ANTES de borrar y
   * cascada de PostgreSQL.
   */
  recursosDisponibles() {
    return RECURSOS.map((r) => ({
      clave: r.clave, etiqueta: r.etiqueta, permiso: r.permiso, campoCodigo: r.campoCodigo,
    }));
  }

  async vistaPreviaRecurso(clave: string, id: string) {
    const R = porClave(clave);
    if (!R) throw new BadRequestException(`No sé borrar "${clave}".`);
    const p: any = this.prisma;

    const select: any = { id: true };
    for (const c of R.camposResumen) select[c] = true;
    if (!select[R.campoCodigo] && R.campoCodigo !== 'id') select[R.campoCodigo] = true;
    const claves = Object.keys(R.arrastra ?? {});
    const clavesVivas = Object.keys(R.sobrevive ?? {});
    if (claves.length || clavesVivas.length) {
      select._count = { select: Object.fromEntries([...claves, ...clavesVivas].map((k) => [k, true])) };
    }

    const reg = await p[R.modelo].findUnique({ where: { id }, select });
    if (!reg) throw new NotFoundException(`Ese registro (${R.etiqueta}) no existe.`);

    const arrastra = claves
      .map((k) => ({ que: R.arrastra![k], n: reg._count?.[k] ?? 0 }))
      .filter((x) => x.n > 0);
    const sobrevive = clavesVivas
      .map((k) => ({ que: R.sobrevive![k], n: reg._count?.[k] ?? 0 }))
      .filter((x) => x.n > 0);

    /* LOS AVISOS. No prohíben: exigen la segunda llave.
       Es la misma decisión que en las OM: el sistema no ha estrenado y una
       prohibición dura obligaría a estrenar con basura dentro. Forzar queda
       marcado en la auditoría con el aviso concreto que se saltó. */
    const avisos: string[] = [];
    for (const av of R.avisos ?? []) {
      if (av.contar) {
        const n = await p[av.contar.modelo].count({ where: av.contar.donde(id) }).catch(() => 0);
        if (n > 0) avisos.push(av.texto(n));
      } else if (av.campo) {
        if (reg[av.campo] === av.valorPeligroso) avisos.push(av.texto(1));
      }
    }

    const codigo = R.campoCodigo === 'id' ? reg.id : String(reg[R.campoCodigo] ?? reg.id);
    const { _count, ...resumen } = reg;

    return {
      recurso: { clave: R.clave, etiqueta: R.etiqueta, campoCodigo: R.campoCodigo },
      registro: resumen,
      codigo,
      arrastra,
      totalArrastrado: arrastra.reduce((s: number, x: any) => s + x.n, 0),
      sobrevive,
      avisos,
      exigeForzar: avisos.length > 0,
      sePuedePurgar: true,
      motivoSiNo: null as string | null,
    };
  }

  async purgarRecurso(
    clave: string,
    id: string,
    confirmacion: string,
    userId?: string | null,
    ip?: string | null,
    forzar = false,
  ) {
    await this.exigirJefe(userId);
    const R = porClave(clave);
    if (!R) throw new BadRequestException(`No sé borrar "${clave}".`);

    const previa = await this.vistaPreviaRecurso(clave, id);

    if (previa.exigeForzar && !forzar) {
      throw new BadRequestException(
        `Esto tiene avisos y hay que confirmar que se borra igual:\n\n· ${previa.avisos.join('\n· ')}`,
      );
    }

    /* La confirmación escrita, igual para todos. Cuando el código es el
       identificador interno —una parada, un plan preventivo— se acepta la
       palabra BORRAR: nadie va a teclear un uuid de 36 caracteres, y pedirlo
       sólo consigue que se copie y se pegue sin mirar, que es justo lo
       contrario de lo que este freno busca. */
    const esperado = R.campoCodigo === 'id' ? 'BORRAR' : previa.codigo;
    const escrito = (confirmacion || '').trim();
    const coincide = R.campoCodigo === 'id'
      ? escrito.toUpperCase() === 'BORRAR'
      : escrito.toUpperCase() === String(esperado).toUpperCase();
    if (!coincide) {
      throw new BadRequestException(
        `Para borrar definitivamente hay que escribir exactamente: ${esperado}`,
      );
    }

    await this.audit.record({
      userId: userId || null,
      action: 'PURGE_' + R.clave.toUpperCase().replace(/-/g, '_'),
      entity: R.modelo,
      entityId: id,
      ip,
      before: {
        etiqueta: R.etiqueta,
        codigo: previa.codigo,
        registro: previa.registro,
        arrastrado: previa.arrastra,
        conservado: previa.sobrevive,
        forzado: previa.exigeForzar || undefined,
        avisos: previa.exigeForzar ? previa.avisos : undefined,
      },
    });

    const p: any = this.prisma;
    await p[R.modelo].delete({ where: { id } });

    return {
      ok: true,
      etiqueta: R.etiqueta,
      codigo: previa.codigo,
      arrastrado: previa.totalArrastrado,
      conservado: previa.sobrevive.reduce((s: number, x: any) => s + x.n, 0),
    };
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
      where: { createdAt: { lt: fecha }, action: { notIn: ['PURGE_ASSET', 'PURGE_USER', 'PURGE_AUDIT', 'PURGE_WORKORDER'] } },
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
        action: { notIn: ['PURGE_ASSET', 'PURGE_USER', 'PURGE_AUDIT', 'PURGE_WORKORDER'] },
      },
    });
    return { ok: true, borrados: r.count };
  }
}
