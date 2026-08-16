import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ETIQUETAS, perfilDe, PERFILES } from './requisitos-sitio';
import { conReintentoDeCodigo, siguienteCorrelativo } from '../../common/correlativo';
import {
  CrearInstalacionDto, DecidirInstalacionDto, EvaluarInstalacionDto, InstaladaDto,
} from './dto/instalacion.dto';

/**
 * INSTALACIONES (Bloque 16)
 *
 * ===========================================================================
 *  POR QUÉ ESTO NO ES UNA ORDEN DE MANTENIMIENTO
 * ===========================================================================
 *  Una OM arregla algo que ya existe y ya está en el inventario. Una
 *  instalación pone algo que NO existe todavía, y las preguntas son otras:
 *
 *      ¿hay corriente ahí? ¿llega la red? ¿cuántos metros de cable?
 *      ¿se sube sin manlift? ¿quién autoriza entrar?
 *
 *  Meter esos cuarenta campos en el formulario de la OM habría castigado al
 *  95 % de las órdenes, que no los necesitan.
 *
 * ===========================================================================
 *  EL CICLO, Y POR QUÉ TIENE CUATRO PASOS Y NO UNO
 * ===========================================================================
 *
 *   SOLICITADA   Alguien pide una cámara. Sólo dice QUÉ y PARA QUÉ.
 *                No se le pide que sepa cuántos metros de cable hacen falta:
 *                pedírselo sólo consigue que invente un número que después
 *                alguien toma por bueno.
 *
 *   EVALUADA     Un técnico VA AL SITIO y mide. Aquí salen los datos que
 *                deciden si esto son dos horas o dos días. Este paso es el
 *                que hoy no existe en planta y por eso los trabajos se
 *                cotizan mal.
 *
 *   APROBADA     El Jefe decide con el costo delante, no con una idea.
 *
 *   INSTALADA    Se hizo. **Y NACE EL ACTIVO**: se crea el registro en el
 *                inventario con su ubicación y su ficha. Ése es el remate.
 *                Sin él, el equipo queda puesto en la pared y fuera del
 *                sistema — que es exactamente el problema que este ERP
 *                existe para resolver.
 *
 * ===========================================================================
 *  EL FORMULARIO CAMBIA SEGÚN EL SITIO
 * ===========================================================================
 *  Ver `requisitos-sitio.ts`. Esa tabla la usan el frontend (para enseñar
 *  campos) y este servicio (para exigirlos). Una sola fuente: si estuvieran
 *  duplicadas, un día el formulario pediría algo que el servidor no valida.
 */
@Injectable()
export class InstalacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private inc = {
    location: { select: { id: true, code: true, name: true, path: true } },
    workOrder: { select: { id: true, code: true, status: true } },
    assetCreado: { select: { id: true, assetCode: true } },
    fotos: { select: { id: true, fileId: true, descripcion: true, momento: true } },
  };

  /** Los perfiles, para que la pantalla sepa qué enseñar. */
  perfiles() {
    return {
      etiquetas: ETIQUETAS,
      perfiles: Object.fromEntries(
        Object.keys(PERFILES).map((k) => [k, PERFILES[k]]),
      ),
      generico: perfilDe('__no_existe__'),
    };
  }

  /**
   * Código correlativo por año: INS-2026-0001.
   *
   * Se calcula del último del año y no de un contador aparte: un contador es
   * otra cosa que se puede desincronizar con la tabla, y aquí el volumen es
   * de decenas al año, no de miles por segundo.
   */
  private async siguienteCodigo(): Promise<string> {
    const anio = new Date().getFullYear();
    const ultimo = await this.prisma.instalacion.findFirst({
      where: { codigo: { startsWith: `INS-${anio}-` } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    const n = ultimo ? Number(ultimo.codigo.split('-')[2]) + 1 : 1;
    return `INS-${anio}-${String(n).padStart(4, '0')}`;
  }

  async listar(q: { estado?: string; tipoSitio?: string; tren?: string; texto?: string }) {
    const where: any = {};
    if (q.estado) where.estado = q.estado;
    if (q.tipoSitio) where.tipoSitio = q.tipoSitio;
    if (q.tren) where.tren = q.tren;
    const t = (q.texto || '').trim();
    if (t) {
      where.OR = [
        { codigo: { contains: t, mode: 'insensitive' } },
        { justificacion: { contains: t, mode: 'insensitive' } },
        { referenciaSitio: { contains: t, mode: 'insensitive' } },
        { solicitadaPor: { contains: t, mode: 'insensitive' } },
      ];
    }
    return this.prisma.instalacion.findMany({
      where,
      orderBy: [{ estado: 'asc' }, { creadoEn: 'desc' }],
      take: 300,
      include: this.inc,
    });
  }

  async detalle(id: string) {
    const i = await this.prisma.instalacion.findUnique({ where: { id }, include: this.inc });
    if (!i) throw new NotFoundException('Esa instalación no existe.');
    const perfil = perfilDe(i.tipoSitio as string);
    return {
      ...i,
      perfil,
      // Lo que falta para poder cerrar la evaluación. La pantalla lo enseña
      // como lista de pendientes en vez de un error al pulsar Guardar.
      faltaParaEvaluar: this.faltantes(i, perfil.obligatoriosAlEvaluar),
    };
  }

  private faltantes(i: any, obligatorios: string[]) {
    return obligatorios
      .filter((c) => i[c] === null || i[c] === undefined || i[c] === '')
      .map((c) => ({ campo: c, etiqueta: ETIQUETAS[c] ?? c }));
  }

  async crear(dto: CrearInstalacionDto, userId?: string | null, ip?: string | null) {
    if (dto.locationId) {
      const l = await this.prisma.location.findUnique({ where: { id: dto.locationId }, select: { id: true } });
      if (!l) throw new BadRequestException('La ubicación indicada no existe.');
    }
    const codigo = await this.siguienteCodigo();
    const i = await this.prisma.instalacion.create({
      data: {
        codigo,
        tipoSitio: dto.tipoSitio as any,
        tipoEquipo: dto.tipoEquipo as any,
        cantidad: dto.cantidad ?? 1,
        tren: (dto.tren as any) ?? null,
        locationId: dto.locationId || null,
        referenciaSitio: dto.referenciaSitio?.trim() || null,
        comoLlegar: dto.comoLlegar?.trim() || null,
        justificacion: dto.justificacion.trim(),
        solicitadaPor: dto.solicitadaPor?.trim() || null,
        areaSolicitante: dto.areaSolicitante?.trim() || null,
        notas: dto.notas?.trim() || null,
        creadoPorId: userId || null,
      },
      include: this.inc,
    });
    await this.audit.record({
      userId, action: 'CREATE', entity: 'instalaciones', entityId: i.id, ip,
      after: { codigo, tipoSitio: i.tipoSitio, tipoEquipo: i.tipoEquipo },
    });
    return i;
  }

  /**
   * GUARDAR LA VISITA. Se puede guardar A MEDIAS.
   *
   * El técnico está en el sitio, con guantes, midiendo. Si el formulario sólo
   * deja guardar completo, apunta en un papel y lo pasa después — o no lo
   * pasa. Con `cerrarEvaluacion: false` guarda lo que lleve; sólo al cerrar
   * se exige lo que el perfil del sitio necesita.
   */
  async evaluar(id: string, dto: EvaluarInstalacionDto, userId?: string | null, ip?: string | null) {
    const previa = await this.prisma.instalacion.findUnique({ where: { id } });
    if (!previa) throw new NotFoundException('Esa instalación no existe.');
    if (['INSTALADA', 'CANCELADA', 'RECHAZADA'].includes(previa.estado as string)) {
      throw new BadRequestException(`Esta instalación está ${previa.estado} y ya no se edita.`);
    }

    const { cerrarEvaluacion, ...campos } = dto as any;
    const datos: any = {};
    for (const [k, v] of Object.entries(campos)) {
      if (v === undefined) continue;
      datos[k] = typeof v === 'string' ? (v.trim() || null) : v;
    }

    const perfil = perfilDe(previa.tipoSitio as string);
    const resultante = { ...previa, ...datos };

    if (cerrarEvaluacion) {
      const faltan = this.faltantes(resultante, perfil.obligatoriosAlEvaluar);
      if (faltan.length > 0) {
        throw new BadRequestException(
          `Para dar la visita por hecha falta:\n· ${faltan.map((f) => f.etiqueta).join('\n· ')}`,
        );
      }
      datos.estado = 'EVALUADA';
      datos.evaluadaPorId = userId || null;
      datos.evaluadaEn = new Date();
    } else if (previa.estado === 'SOLICITADA') {
      datos.estado = 'EN_EVALUACION';
    }

    const i = await this.prisma.instalacion.update({ where: { id }, data: datos, include: this.inc });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'instalaciones', entityId: id, ip,
      after: { codigo: i.codigo, estado: i.estado, cerrada: !!cerrarEvaluacion },
    });
    return this.detalle(id);
  }

  /**
   * APROBAR O RECHAZAR. Sólo sobre algo EVALUADO.
   *
   * Aprobar una instalación sin visita es firmar en blanco: no se sabe si son
   * 20 metros de cable o 200, ni si hace falta manlift. Eso es exactamente lo
   * que hace que un trabajo de un día se convierta en tres.
   */
  async decidir(id: string, dto: DecidirInstalacionDto, userId?: string | null, ip?: string | null) {
    const previa = await this.prisma.instalacion.findUnique({ where: { id } });
    if (!previa) throw new NotFoundException('Esa instalación no existe.');
    if (previa.estado !== 'EVALUADA') {
      throw new BadRequestException(
        `Sólo se decide sobre una instalación EVALUADA, y ésta está ${previa.estado}. ` +
        `Aprobar sin visita es firmar sin saber si son 20 metros de cable o 200.`,
      );
    }
    if (!dto.aprobar && !dto.motivo?.trim()) {
      throw new BadRequestException('Di por qué se rechaza: quien la pidió tiene que poder rebatirlo o corregirla.');
    }

    const i = await this.prisma.instalacion.update({
      where: { id },
      data: dto.aprobar
        ? { estado: 'APROBADA', aprobadaPorId: userId || null, aprobadaEn: new Date(), motivoRechazo: null }
        : { estado: 'RECHAZADA', motivoRechazo: dto.motivo!.trim() },
      include: this.inc,
    });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'instalaciones', entityId: id, ip,
      after: { codigo: i.codigo, estado: i.estado, motivo: dto.motivo?.trim() },
    });
    return i;
  }

  /**
   * Genera la OM de ejecución a partir de la instalación aprobada.
   * Se copia lo que el técnico necesita en campo, para que no tenga que
   * abrir dos pantallas con el casco puesto.
   */
  async generarOrden(id: string, userId?: string | null, ip?: string | null) {
    const i = await this.prisma.instalacion.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Esa instalación no existe.');
    if (i.estado !== 'APROBADA') throw new BadRequestException('Sólo se genera la orden de una instalación APROBADA.');
    if (i.workOrderId) throw new ConflictException('Esta instalación ya tiene una orden generada.');

    const detalles = [
      `Instalación ${i.codigo}: ${i.cantidad} x ${i.tipoEquipo} en ${i.tipoSitio}.`,
      i.referenciaSitio ? `Sitio: ${i.referenciaSitio}` : null,
      i.metrosCable ? `Cable estimado: ${i.metrosCable} m` : null,
      i.necesitaManlift ? 'REQUIERE MANLIFT' : null,
      i.necesitaLoto ? 'REQUIERE BLOQUEO LOTO' : null,
      i.necesitaPermisoAltura ? 'REQUIERE PERMISO DE ALTURA' : null,
      i.quienAutoriza ? `Autoriza: ${i.quienAutoriza}` : null,
    ].filter(Boolean).join('\n');

    /* BLOQUE 37 — EL CORRELATIVO SE CALCULA DENTRO DEL REINTENTO.
       -----------------------------------------------------------------------
       Antes se leía la última OT, se sumaba uno y se escribía. Entre la
       lectura y la escritura cabe otra persona, y como `code` es único la
       segunda se llevaba un 500. Ahora, si el número ya está cogido, se pide
       el siguiente y se repite.

       Se RELEE la última en cada reintento, así que el número ya tiene en
       cuenta la orden que acaba de entrar y no quedan huecos en la serie.

       Y el reintento envuelve la TRANSACCIÓN ENTERA, no sólo la creación: si
       la orden se crea y la instalación no pasa a EN_EJECUCION, queda una
       orden huérfana que nadie va a relacionar con nada. */
    const prefijo = `OT-${new Date().getFullYear()}-`;
    const [wo] = await conReintentoDeCodigo(async () => {
      const ultima = await this.prisma.workOrder.findFirst({
        where: { code: { startsWith: prefijo } },
        orderBy: { code: 'desc' }, select: { code: true },
      });
      return this.prisma.$transaction([
        this.prisma.workOrder.create({
          data: {
            code: siguienteCorrelativo(ultima?.code, prefijo),
            type: 'CORRECTIVO',
            status: 'ABIERTA',
            locationId: i.locationId,
            activity: detalles,
            zone: i.referenciaSitio,
            materials: i.materialesEstimados,
            openedById: userId || null,
          },
        }),
        this.prisma.instalacion.update({ where: { id }, data: { estado: 'EN_EJECUCION' } }),
      ]);
    });
    await this.prisma.instalacion.update({ where: { id }, data: { workOrderId: wo.id } });

    await this.audit.record({
      userId, action: 'CREATE', entity: 'instalaciones', entityId: id, ip,
      after: { codigo: i.codigo, ordenGenerada: wo.code },
    });
    return { ok: true, orden: { id: wo.id, code: wo.code } };
  }

  /**
   * TERMINAR: **aquí nace el activo**.
   *
   * Es el remate del ciclo y la razón de ser del módulo. Todo lo que se midió
   * en la visita se vuelca en la ficha del equipo: ubicación, ambiente, dónde
   * está de verdad y cómo se llega. Ese conocimiento se pierde si sólo vive
   * en la instalación.
   *
   * Todo en UNA transacción: si el activo se crea y la instalación no se
   * marca, mañana alguien la vuelve a ejecutar y aparece el equipo duplicado.
   */
  async marcarInstalada(id: string, dto: InstaladaDto, userId?: string | null, ip?: string | null) {
    const i = await this.prisma.instalacion.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Esa instalación no existe.');
    if (!['APROBADA', 'EN_EJECUCION'].includes(i.estado as string)) {
      throw new BadRequestException(`No se puede cerrar una instalación en estado ${i.estado}.`);
    }
    if (i.assetCreadoId) throw new ConflictException('Esta instalación ya creó su activo.');

    const codigo = dto.assetCode.trim().toUpperCase();
    const repetido = await this.prisma.asset.findUnique({ where: { assetCode: codigo }, select: { id: true } });
    if (repetido) throw new ConflictException(`Ya existe un activo con el código ${codigo}.`);

    const locationId = dto.locationId || i.locationId;

    const [asset] = await this.prisma.$transaction([
      this.prisma.asset.create({
        data: {
          assetCode: codigo,
          type: i.tipoEquipo,
          brand: dto.brand?.trim() || null,
          model: dto.modelo?.trim() || null,
          serialNumber: dto.serialNumber?.trim() || null,
          status: 'OPERATIVO',
          locationId: locationId || null,
          cabinetId: dto.cabinetId || null,
          // Lo que se midió en la visita viaja a la ficha del equipo.
          referencePlace: i.referenciaSitio,
          /* EL AMBIENTE NO SE COPIA AL ACTIVO, Y ES A PROPÓSITO.
             `Asset` no tiene campo `environment`: el ambiente se DEDUCE del
             árbol de ubicaciones, igual que el tren y la criticidad. Escribirlo
             a mano en el activo crearía una segunda verdad que se desincroniza
             el día que alguien corrija la etapa. El dato medido en la visita
             queda guardado en la instalación, que es su sitio. */
          // Ficha incompleta a propósito: nace con lo que se sabe hoy y se
          // completa después. Igual que en el mapeo.
          isDraft: true,
        },
      }),
      this.prisma.instalacion.update({
        where: { id },
        data: {
          estado: 'INSTALADA',
          instaladaEn: new Date(),
          notas: dto.notas?.trim() || i.notas,
        },
      }),
    ]);

    await this.prisma.instalacion.update({ where: { id }, data: { assetCreadoId: asset.id } });

    await this.audit.record({
      userId, action: 'CREATE', entity: 'instalaciones', entityId: id, ip,
      after: { codigo: i.codigo, activoCreado: asset.assetCode },
    });
    return { ok: true, activo: { id: asset.id, assetCode: asset.assetCode } };
  }

  async cancelar(id: string, motivo: string, userId?: string | null, ip?: string | null) {
    const i = await this.prisma.instalacion.findUnique({ where: { id } });
    if (!i) throw new NotFoundException('Esa instalación no existe.');
    if (i.estado === 'INSTALADA') {
      throw new BadRequestException('Ya está instalada: cancelarla no desinstala nada. Si el equipo se retiró, dale de baja al activo.');
    }
    if (!motivo?.trim()) throw new BadRequestException('Di por qué se cancela.');

    const r = await this.prisma.instalacion.update({
      where: { id }, data: { estado: 'CANCELADA', motivoRechazo: motivo.trim() }, include: this.inc,
    });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'instalaciones', entityId: id, ip,
      after: { codigo: i.codigo, estado: 'CANCELADA', motivo: motivo.trim() },
    });
    return r;
  }

  /** Resumen para el tablero: qué está esperando a quién. */
  async resumen() {
    const [porEstado, porSitio, esperandoVisita, esperandoDecision] = await Promise.all([
      this.prisma.instalacion.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.instalacion.groupBy({ by: ['tipoSitio'], _count: { _all: true } }),
      this.prisma.instalacion.count({ where: { estado: { in: ['SOLICITADA', 'EN_EVALUACION'] } } }),
      this.prisma.instalacion.count({ where: { estado: 'EVALUADA' } }),
    ]);
    return {
      porEstado: porEstado.map((e) => ({ estado: e.estado as string, n: e._count._all })),
      porSitio: porSitio.map((e) => ({ tipoSitio: e.tipoSitio as string, n: e._count._all })),
      esperandoVisita,
      esperandoDecision,
    };
  }
}
