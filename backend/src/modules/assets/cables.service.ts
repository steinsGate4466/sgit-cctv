import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { AuditService } from '../audit/audit.service';
import { CreateCableDto, UpdateCableDto, QueryCableDto } from './dto/cable.dto';

/**
 * TRAMOS DE CABLE.
 *
 * POR QUÉ ES UN MÓDULO Y NO UN CAMPO
 * El límite de un tramo horizontal Ethernet son 90 m (100 m de canal contando
 * los latiguillos). Pasado eso el enlace no deja de funcionar: funciona A
 * VECES. Con frío anda, con calor se cae. Ese es el "se arregla y vuelve a
 * fallar" del que se queja el Jefe, y nadie lo va a descubrir jamás si no está
 * anotado que ese tramo mide 118 metros.
 *
 * Como tramo entre dos puntos —y no como dato de la cámara— sirve además para
 * detectar reincidencia COMPARTIDA: varias cámaras que fallan y cuelgan del
 * mismo tramo apuntan al cable, no a las cámaras.
 */

/** Límite de norma para el tramo horizontal, en metros. */
export const LIMITE_TRAMO_M = 90;

@Injectable()
export class CablesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Diagnóstico automático del tramo.
   * Devuelve los avisos que el técnico debería ver, con su motivo.
   */
  static avisos(cable: any): string[] {
    const lista: string[] = [];
    const m = cable?.meters;

    if (m != null && m > LIMITE_TRAMO_M) {
      lista.push(
        `Tramo de ${m} m: excede el límite de ${LIMITE_TRAMO_M} m. ` +
        'Causa probable de fallas intermitentes' +
        (cable.metersEstimated ? ' (medida estimada, conviene confirmarla).' : '.'),
      );
    } else if (m != null && m > LIMITE_TRAMO_M * 0.9) {
      lista.push(`Tramo de ${m} m: al límite de norma. Sin margen para ampliar.`);
    }

    // Un UTP sin blindaje por bandeja compartida con fuerza, en una planta con
    // hornos y centros de control de motores, se llena de ruido. Mismo síntoma:
    // intermitente e irreproducible.
    if (cable?.route === 'BANDEJA' && cable?.shielded === false) {
      lista.push('Cable sin blindaje por bandeja: riesgo de interferencia si comparte con fuerza.');
    }
    if (cable?.route === 'INTEMPERIE' && cable?.category?.startsWith?.('CAT')) {
      lista.push('Cobre a la intemperie en zona costera: revisar deterioro por salinidad.');
    }
    if (cable?.status === 'DANADO' || cable?.status === 'A_REEMPLAZAR') {
      lista.push('Tramo marcado para reemplazo.');
    }
    return lista;
  }

  private async validarExtremos(dto: { fromAssetId?: string; toAssetId?: string }) {
    if (dto.fromAssetId && dto.toAssetId && dto.fromAssetId === dto.toAssetId) {
      throw new BadRequestException('Un tramo no puede empezar y terminar en el mismo equipo.');
    }
    for (const [campo, id] of [['origen', dto.fromAssetId], ['destino', dto.toAssetId]] as const) {
      if (!id) continue;
      const existe = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } });
      if (!existe) throw new NotFoundException(`El equipo de ${campo} no existe.`);
    }
  }

  async findAll(q: QueryCableDto) {
    // Ámbito de planta. Un tramo pertenece al tren de CUALQUIERA de sus dos
    // extremos: un enlace entre trenes tiene que salir en los dos, no
    // desaparecer de ambos.
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q.tren, etapa: q.etapa });

    // Los dos filtros por extremo (ámbito y activo concreto) son sendos OR.
    // Puestos como dos claves OR en el mismo objeto, la segunda ANULA a la
    // primera en silencio: filtrar por tren y por activo a la vez perdería el
    // tren sin avisar. Por eso van dentro de un AND, que sí los acumula.
    const condiciones: any[] = [];
    if (ambito) {
      condiciones.push({
        OR: [{ fromAsset: { locationId: ambito } }, { toAsset: { locationId: ambito } }],
      });
    }
    if (q.assetId) {
      condiciones.push({ OR: [{ fromAssetId: q.assetId }, { toAssetId: q.assetId }] });
    }

    const rows = await this.prisma.assetCable.findMany({
      where: {
        status: q.status,
        category: q.category,
        ...(condiciones.length ? { AND: condiciones } : {}),
        // Filtro directo para el listado de "tramos fuera de norma".
        ...(q.fueraNorma === 'true' ? { meters: { gt: LIMITE_TRAMO_M } } : {}),
      },
      include: {
        fromAsset: { select: { id: true, assetCode: true, type: true } },
        toAsset: { select: { id: true, assetCode: true, type: true } },
      },
      orderBy: [{ status: 'asc' }, { meters: 'desc' }],
    });
    return rows.map((c) => ({ ...c, avisos: CablesService.avisos(c) }));
  }

  async create(dto: CreateCableDto, userId?: string | null, ip?: string | null) {
    await this.validarExtremos(dto);

    const cable = await this.prisma.assetCable.create({
      data: {
        code: dto.code?.trim() || null,
        category: dto.category,
        meters: dto.meters ?? null,
        // Por defecto ESTIMADO: es lo honesto. Marcar como medido algo que se
        // calculó a ojo llevaría a decidir un reemplazo sobre un dato falso.
        metersEstimated: dto.metersEstimated ?? true,
        shielded: dto.shielded ?? false,
        route: dto.route ?? null,
        status: dto.status ?? 'INSTALADO',
        fromAssetId: dto.fromAssetId || null,
        fromPortNumber: dto.fromPortNumber ?? null,
        toAssetId: dto.toAssetId || null,
        installedAt: dto.installedAt ? new Date(dto.installedAt) : null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        fromAsset: { select: { assetCode: true } },
        toAsset: { select: { assetCode: true } },
      },
    });

    const avisos = CablesService.avisos(cable);
    await this.audit.record({
      userId: userId || null,
      action: 'CREATE_CABLE',
      entity: 'asset_cables',
      entityId: cable.id,
      ip,
      after: {
        categoria: cable.category,
        metros: cable.meters,
        estimado: cable.metersEstimated,
        de: cable.fromAsset?.assetCode || null,
        a: cable.toAsset?.assetCode || null,
        avisos,
      },
    });
    return { ...cable, avisos };
  }

  async update(id: string, dto: UpdateCableDto, userId?: string | null, ip?: string | null) {
    const previo = await this.prisma.assetCable.findUnique({ where: { id } });
    if (!previo) throw new NotFoundException('Tramo no encontrado');
    await this.validarExtremos(dto);

    const cable = await this.prisma.assetCable.update({
      where: { id },
      data: {
        code: dto.code !== undefined ? dto.code?.trim() || null : undefined,
        category: dto.category ?? undefined,
        meters: dto.meters ?? undefined,
        metersEstimated: dto.metersEstimated ?? undefined,
        shielded: dto.shielded ?? undefined,
        route: dto.route ?? undefined,
        status: dto.status ?? undefined,
        fromAssetId: dto.fromAssetId !== undefined ? dto.fromAssetId || null : undefined,
        fromPortNumber: dto.fromPortNumber ?? undefined,
        toAssetId: dto.toAssetId !== undefined ? dto.toAssetId || null : undefined,
        installedAt: dto.installedAt ? new Date(dto.installedAt) : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
      include: {
        fromAsset: { select: { assetCode: true } },
        toAsset: { select: { assetCode: true } },
      },
    });

    await this.audit.record({
      userId: userId || null,
      action: 'UPDATE_CABLE',
      entity: 'asset_cables',
      entityId: id,
      ip,
      before: { metros: previo.meters, estado: previo.status },
      after: { metros: cable.meters, estado: cable.status },
    });
    return { ...cable, avisos: CablesService.avisos(cable) };
  }

  /**
   * Los tramos NO se borran: se marcan como retirados.
   * Un tramo retirado sigue explicando fallas pasadas, y borrarlo dejaría el
   * historial de esas órdenes sin sentido.
   */
  async retirar(id: string, userId?: string | null, ip?: string | null) {
    const cable = await this.prisma.assetCable.findUnique({ where: { id } });
    if (!cable) throw new NotFoundException('Tramo no encontrado');

    const actualizado = await this.prisma.assetCable.update({
      where: { id },
      data: { status: 'RETIRADO' },
    });
    await this.audit.record({
      userId: userId || null,
      action: 'RETIRE_CABLE',
      entity: 'asset_cables',
      entityId: id,
      ip,
      after: { categoria: cable.category, metros: cable.meters },
    });
    return actualizado;
  }

  /** Resumen para el tablero: cuántos tramos hay y cuántos fuera de norma. */
  async resumen() {
    const [total, fueraNorma, sinMedir, danados] = await Promise.all([
      this.prisma.assetCable.count({ where: { status: { not: 'RETIRADO' } } }),
      this.prisma.assetCable.count({
        where: { status: { not: 'RETIRADO' }, meters: { gt: LIMITE_TRAMO_M } },
      }),
      this.prisma.assetCable.count({
        where: { status: { not: 'RETIRADO' }, meters: null },
      }),
      this.prisma.assetCable.count({
        where: { status: { in: ['DANADO', 'A_REEMPLAZAR'] } },
      }),
    ]);
    return { total, fueraNorma, sinMedir, danados, limiteM: LIMITE_TRAMO_M };
  }
}
