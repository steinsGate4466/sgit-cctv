import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrearParadaDto, EstadoParadaDto, MoverParadaDto } from './dto/parada.dto';

/**
 * VENTANAS DE PARADA (F8-F/G/H) — desbloqueado.
 *
 * ===========================================================================
 *  LA PREGUNTA QUE ESTUVO ABIERTA MESES, Y SU RESPUESTA
 * ===========================================================================
 *  «¿De dónde salen las paradas de tren: manual, Producción o SAP?»
 *
 *  RESPUESTA: MANUAL. Producción avisa —por radio, por WhatsApp, de boca— y
 *  **la hora se mueve, muchas veces a última hora**. No hay integración que
 *  traiga esto: hay una persona que se entera y lo apunta.
 *
 *  Eso no es un defecto del proceso, es el proceso. Y el modelo tiene que
 *  parecerse a él o nadie lo va a usar.
 *
 * ===========================================================================
 *  LAS DOS DECISIONES QUE SALEN DE AHÍ
 * ===========================================================================
 *
 *  1. PREVISTO Y REAL SON DOS COSAS DISTINTAS.
 *     Un diseño ingenuo guarda «hora de la parada» y la sobrescribe. Entonces
 *     la parada que empezó a las 3 de la mañana en vez de las 11 de la noche
 *     figura como si siempre hubiera sido a las 3, y la desviación
 *     desaparece. Aquí `inicioPrevisto` es lo que dijo Producción y
 *     `inicioReal` lo que pasó. Restar los dos es el dato.
 *
 *  2. CADA MOVIMIENTO DE HORA SE GUARDA, CON MOTIVO OBLIGATORIO.
 *     Cuando la ventana se mueve tres veces y el trabajo no se hace, sin
 *     registro parece culpa de mantenimiento. Con registro es un hecho
 *     contable: «se movió 14 veces este mes, 9 por cambio de programa».
 *     Lo primero es una queja. Lo segundo va a una reunión.
 *
 *  NO SE VALIDA QUE LA HORA SEA FUTURA, y es a propósito: media planta se
 *  entera de la parada cuando ya empezó, y el sistema tiene que dejar
 *  registrarla igual. Un formulario que rechaza la realidad se deja de usar.
 */
@Injectable()
export class ParadasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `_count` NO es una opción de primer nivel: va DENTRO de `include`.
   * Escrito como `{ _count: ... }` a pelo, TypeScript lo tipa como `never` y
   * el build revienta en las cinco llamadas que lo usan. Aquí se guarda ya
   * envuelto para que `...this.incluir` inyecte el `include` completo.
   */
  private incluir = {
    include: { _count: { select: { ordenes: true, cambios: true } } },
  };

  /** Minutos entre dos fechas, o null si falta alguna. */
  private minutos(a?: Date | null, b?: Date | null): number | null {
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 60000);
  }

  /**
   * Añade lo calculado: cuánto se movió, cuánto duró de verdad, y si la
   * desviación es a favor o en contra.
   */
  private enriquecer(p: any) {
    const durPrev = p.duracionPrevMin ?? this.minutos(p.inicioPrevisto, p.finPrevisto);
    const durReal = this.minutos(p.inicioReal, p.finReal);
    return {
      ...p,
      duracionPrevistaMin: durPrev,
      duracionRealMin: durReal,
      /// Positivo = duró MÁS de lo prometido. Es el número que interesa:
      /// si siempre es negativo, el trabajo se planifica con ventanas que
      /// no existen.
      desviacionMin: durPrev != null && durReal != null ? durReal - durPrev : null,
      /// Cuánto se corrió respecto de lo primero que se anunció.
      arranqueDesviadoMin: this.minutos(p.inicioPrevisto, p.inicioReal),
      vecesMovida: p._count?.cambios ?? 0,
      ordenes: p._count?.ordenes ?? 0,
    };
  }

  async listar(q: { tren?: string; estado?: string; desde?: string; hasta?: string }) {
    const where: any = {};
    if (q.tren) where.tren = q.tren;
    if (q.estado) where.estado = q.estado;
    if (q.desde || q.hasta) {
      where.inicioPrevisto = {};
      if (q.desde) where.inicioPrevisto.gte = new Date(q.desde);
      if (q.hasta) where.inicioPrevisto.lte = new Date(q.hasta);
    }
    const filas = await this.prisma.ventanaParada.findMany({
      where,
      orderBy: { inicioPrevisto: 'desc' },
      take: 200,
      ...this.incluir,
    });
    return filas.map((f) => this.enriquecer(f));
  }

  /**
   * LO QUE VIENE. Es la pantalla que mira el ingeniero por la mañana:
   * qué ventanas hay abiertas y cuánto trabajo tienen colgado.
   */
  async proximas(tren?: string) {
    const desde = new Date(Date.now() - 12 * 3600_000); // las de esta noche siguen contando
    const filas = await this.prisma.ventanaParada.findMany({
      where: {
        estado: { in: ['ANUNCIADA', 'CONFIRMADA', 'EN_CURSO'] },
        inicioPrevisto: { gte: desde },
        ...(tren ? { tren: tren as any } : {}),
      },
      orderBy: { inicioPrevisto: 'asc' },
      take: 30,
      ...this.incluir,
    });
    return filas.map((f) => this.enriquecer(f));
  }

  async detalle(id: string) {
    const p = await this.prisma.ventanaParada.findUnique({
      where: { id },
      include: {
        cambios: { orderBy: { en: 'desc' } },
        ordenes: {
          select: {
            id: true, code: true, type: true, status: true, activity: true,
            progressPct: true, asset: { select: { assetCode: true } },
          },
          orderBy: { code: 'asc' },
        },
        _count: { select: { ordenes: true, cambios: true } },
      },
    });
    if (!p) throw new NotFoundException('Esa ventana de parada no existe.');
    return this.enriquecer(p);
  }

  async crear(dto: CrearParadaDto, userId?: string | null, ip?: string | null) {
    const inicio = new Date(dto.inicioPrevisto);
    const fin = dto.finPrevisto ? new Date(dto.finPrevisto) : null;
    if (fin && fin <= inicio) {
      throw new BadRequestException('El fin previsto tiene que ser posterior al inicio.');
    }

    const p = await this.prisma.ventanaParada.create({
      data: {
        tren: dto.tren as any,
        origen: (dto.origen as any) || 'PRODUCCION',
        inicioPrevisto: inicio,
        finPrevisto: fin,
        duracionPrevMin: dto.duracionPrevMin ?? (fin ? this.minutos(inicio, fin) : null),
        motivo: dto.motivo?.trim() || null,
        avisadoPor: dto.avisadoPor?.trim() || null,
        canalAviso: dto.canalAviso?.trim() || null,
        notas: dto.notas?.trim() || null,
        creadoPorId: userId || null,
      },
      ...this.incluir,
    });
    await this.audit.record({
      userId, action: 'CREATE', entity: 'paradas', entityId: p.id, ip,
      after: { tren: p.tren, inicioPrevisto: p.inicioPrevisto, origen: p.origen },
    });
    return this.enriquecer(p);
  }

  /**
   * MOVER LA HORA. El corazón del módulo.
   *
   * Cada campo que cambia deja su propia fila en `cambios_parada`, con el
   * valor de antes y el de después. Se escriben en la misma transacción que
   * el cambio: un historial que se puede escribir a medias no vale nada.
   */
  async mover(id: string, dto: MoverParadaDto, userId?: string | null, ip?: string | null) {
    const previa = await this.prisma.ventanaParada.findUnique({ where: { id } });
    if (!previa) throw new NotFoundException('Esa ventana de parada no existe.');
    if (previa.estado === 'TERMINADA' || previa.estado === 'CANCELADA') {
      throw new BadRequestException(
        'Esta ventana ya terminó o se canceló. Si hay una parada nueva, créala aparte: ' +
        'reescribir la vieja borraría el historial de lo que pasó.',
      );
    }

    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 3) {
      throw new BadRequestException(
        'Escribe por qué se mueve. Sin el motivo, "siempre nos mueven la parada" ' +
        'se queda en una queja en vez de un dato.',
      );
    }

    const datos: any = {};
    const cambios: any[] = [];
    const anotar = (campo: string, antes: any, despues: any) => {
      const a = antes instanceof Date ? antes.toISOString() : antes == null ? null : String(antes);
      const d = despues instanceof Date ? despues.toISOString() : despues == null ? null : String(despues);
      if (a === d) return; // no se anota lo que no cambió
      cambios.push({ paradaId: id, campo, valorAntes: a, valorDespues: d, motivo, porId: userId || null });
    };

    if (dto.inicioPrevisto !== undefined) {
      const v = new Date(dto.inicioPrevisto);
      anotar('inicioPrevisto', previa.inicioPrevisto, v);
      datos.inicioPrevisto = v;
    }
    if (dto.finPrevisto !== undefined) {
      const v = new Date(dto.finPrevisto);
      anotar('finPrevisto', previa.finPrevisto, v);
      datos.finPrevisto = v;
    }
    if (dto.duracionPrevMin !== undefined) {
      anotar('duracionPrevMin', previa.duracionPrevMin, dto.duracionPrevMin);
      datos.duracionPrevMin = dto.duracionPrevMin;
    }

    const inicio = datos.inicioPrevisto ?? previa.inicioPrevisto;
    const fin = datos.finPrevisto ?? previa.finPrevisto;
    if (fin && fin <= inicio) {
      throw new BadRequestException('El fin previsto tiene que ser posterior al inicio.');
    }
    if (cambios.length === 0) throw new BadRequestException('No cambiaste ninguna hora.');

    // Historial y cambio, o ninguno de los dos.
    const [, p] = await this.prisma.$transaction([
      this.prisma.cambioParada.createMany({ data: cambios }),
      this.prisma.ventanaParada.update({ where: { id }, data: datos, ...this.incluir }),
    ]);

    await this.audit.record({
      userId, action: 'UPDATE', entity: 'paradas', entityId: id, ip,
      before: { inicioPrevisto: previa.inicioPrevisto, finPrevisto: previa.finPrevisto },
      after: { ...datos, motivo, movimientos: cambios.length },
    });
    return this.enriquecer(p);
  }

  /**
   * Cambiar el estado. Al arrancar y al terminar se guarda la hora REAL, que
   * es lo que después permite medir la desviación.
   */
  async cambiarEstado(id: string, dto: EstadoParadaDto, userId?: string | null, ip?: string | null) {
    const previa = await this.prisma.ventanaParada.findUnique({ where: { id } });
    if (!previa) throw new NotFoundException('Esa ventana de parada no existe.');

    const datos: any = { estado: dto.estado };
    const ahora = new Date();

    if (dto.estado === 'EN_CURSO') {
      datos.inicioReal = dto.inicioReal ? new Date(dto.inicioReal) : (previa.inicioReal ?? ahora);
    }
    if (dto.estado === 'TERMINADA') {
      // Si nadie marcó el arranque, se toma lo previsto: es mejor una
      // estimación declarada que un hueco que nadie sabe leer.
      datos.inicioReal = dto.inicioReal ? new Date(dto.inicioReal)
        : (previa.inicioReal ?? previa.inicioPrevisto);
      datos.finReal = dto.finReal ? new Date(dto.finReal) : (previa.finReal ?? ahora);
      if (datos.finReal <= datos.inicioReal) {
        throw new BadRequestException('La hora de fin real no puede ser anterior a la de inicio.');
      }
    }
    if (dto.estado === 'CANCELADA' && !dto.motivo?.trim()) {
      throw new BadRequestException('Di por qué se cancela: la gente ya se había movilizado.');
    }
    if (dto.motivo?.trim()) datos.motivo = dto.motivo.trim();

    const p = await this.prisma.ventanaParada.update({ where: { id }, data: datos, ...this.incluir });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'paradas', entityId: id, ip,
      before: { estado: previa.estado }, after: { estado: p.estado, ...datos },
    });
    return this.enriquecer(p);
  }

  /** Colgar (o descolgar) una OM de la ventana. */
  async ligarOrden(id: string, workOrderId: string, ligar: boolean, userId?: string | null, ip?: string | null) {
    const p = await this.prisma.ventanaParada.findUnique({ where: { id }, select: { id: true, estado: true } });
    if (!p) throw new NotFoundException('Esa ventana de parada no existe.');
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, code: true, status: true } });
    if (!wo) throw new NotFoundException('Esa orden no existe.');
    if (ligar && wo.status === 'CERRADA') {
      throw new BadRequestException('Esa orden ya está cerrada: no tiene sentido colgarla de una ventana futura.');
    }

    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: { paradaId: ligar ? id : null },
    });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'paradas', entityId: id, ip,
      after: { orden: wo.code, ligada: ligar },
    });
    return { ok: true, orden: wo.code, ligada: ligar };
  }

  /**
   * CUÁNTO SE MUEVEN LAS PARADAS. El número para llevar a la reunión.
   * Sin esto el módulo sólo sirve para apuntar; con esto sirve para negociar.
   */
  async fiabilidad(dias = 90) {
    const desde = new Date(Date.now() - dias * 86_400_000);
    const filas = await this.prisma.ventanaParada.findMany({
      where: { inicioPrevisto: { gte: desde } },
      select: {
        tren: true, estado: true, inicioPrevisto: true, inicioReal: true,
        finPrevisto: true, finReal: true, duracionPrevMin: true,
        _count: { select: { cambios: true, ordenes: true } },
      },
    });

    const porTren: Record<string, any> = {};
    for (const f of filas) {
      const t = f.tren as string;
      porTren[t] ??= { tren: t, total: 0, canceladas: 0, movidas: 0, movimientos: 0, desviaciones: [] as number[], ordenes: 0 };
      const b = porTren[t];
      b.total++;
      b.ordenes += f._count.ordenes;
      if (f.estado === 'CANCELADA') b.canceladas++;
      if (f._count.cambios > 0) { b.movidas++; b.movimientos += f._count.cambios; }
      const prev = f.duracionPrevMin ?? this.minutos(f.inicioPrevisto, f.finPrevisto);
      const real = this.minutos(f.inicioReal, f.finReal);
      if (prev != null && real != null) b.desviaciones.push(real - prev);
    }

    return {
      dias,
      trenes: Object.values(porTren).map((b: any) => ({
        tren: b.tren,
        total: b.total,
        canceladas: b.canceladas,
        // Cuántas de cada 100 se movieron al menos una vez.
        pctMovidas: b.total ? Math.round((b.movidas / b.total) * 100) : 0,
        movimientosPorParada: b.movidas ? Number((b.movimientos / b.movidas).toFixed(1)) : 0,
        // Media de la desviación: positiva = duran más de lo prometido.
        desviacionMediaMin: b.desviaciones.length
          ? Math.round(b.desviaciones.reduce((s: number, x: number) => s + x, 0) / b.desviaciones.length)
          : null,
        muestraConCierre: b.desviaciones.length,
        ordenesColgadas: b.ordenes,
      })),
    };
  }
}
