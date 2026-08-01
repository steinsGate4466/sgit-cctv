import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { codigoDesdeNombre, motivoInvalido, agruparItems, TIPOS_CATALOGO } from './catalogos.util';

/**
 * Catálogos editables: causas, síntomas, acciones y motivos.
 *
 * Existen para que la gente de planta pueda nombrar lo que ve sin pedírselo a
 * un programador. Antes las causas eran un enum de 17 valores en el código.
 */
@Injectable()
export class CatalogosService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private validarTipo(kind: string) {
    if (!TIPOS_CATALOGO.includes(kind as any)) {
      throw new BadRequestException(
        `Tipo de catálogo desconocido: ${kind}. Válidos: ${TIPOS_CATALOGO.join(', ')}.`,
      );
    }
  }

  /**
   * Lista de un tipo, ya agrupada y ordenada para pintar el desplegable.
   * Por defecto solo las activas: las desactivadas siguen existiendo para que
   * las órdenes viejas se lean, pero no se ofrecen para elegir.
   */
  async listar(kind: string, incluirInactivas = false) {
    this.validarTipo(kind);
    const items = await this.prisma.catalogItem.findMany({
      where: { kind: kind as any, ...(incluirInactivas ? {} : { active: true }) },
      orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    });
    return { kind, total: items.length, items, grupos: agruparItems(items as any) };
  }

  /** Todo de una vez, para las pantallas que necesitan varios a la vez. */
  async todos() {
    const items = await this.prisma.catalogItem.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { sequence: 'asc' }, { name: 'asc' }],
    });
    const por: Record<string, any[]> = {};
    for (const t of TIPOS_CATALOGO) por[t] = [];
    for (const i of items) (por[i.kind] = por[i.kind] || []).push(i);
    return por;
  }

  async crear(dto: any, userId?: string | null, ip?: string | null) {
    this.validarTipo(dto?.kind);
    const motivo = motivoInvalido(dto);
    if (motivo) throw new BadRequestException(motivo);

    const code = (dto.code || '').trim() || codigoDesdeNombre(dto.name);

    const ya = await this.prisma.catalogItem.findFirst({ where: { kind: dto.kind, code } });
    if (ya) {
      // No se crea un duplicado en silencio: si existe desactivado, lo que el
      // usuario quiere casi seguro es recuperarlo, no tener dos iguales.
      throw new BadRequestException(
        ya.active
          ? `Ya existe "${ya.name}" con ese código en este catálogo.`
          : `Existe "${ya.name}" con ese código pero está desactivado. Actívalo en vez de crear otro.`,
      );
    }

    const item = await this.prisma.catalogItem.create({
      data: {
        kind: dto.kind,
        code,
        name: dto.name.trim(),
        group: dto.group?.trim() || null,
        sequence: Number(dto.sequence) || 0,
        notes: dto.notes?.trim() || null,
      },
    });

    await this.audit.record({
      userId: userId || null,
      action: 'CATALOGO_CREATE',
      entity: 'catalog_items',
      entityId: item.id,
      ip,
      after: { tipo: item.kind, code: item.code, nombre: item.name },
    });
    return item;
  }

  async actualizar(id: string, dto: any, userId?: string | null, ip?: string | null) {
    const ya = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Entrada de catálogo no encontrada');

    if (dto.name !== undefined) {
      const motivo = motivoInvalido({ name: dto.name, code: ya.code });
      if (motivo) throw new BadRequestException(motivo);
    }

    const item = await this.prisma.catalogItem.update({
      where: { id },
      data: {
        // El CÓDIGO no se toca nunca desde aquí. Es lo que está guardado en las
        // órdenes cerradas: cambiarlo reescribiría el pasado. El nombre sí, que
        // es solo la redacción.
        name: dto.name?.trim() || undefined,
        group: dto.group !== undefined ? (dto.group?.trim() || null) : undefined,
        sequence: dto.sequence !== undefined ? Number(dto.sequence) || 0 : undefined,
        active: dto.active !== undefined ? !!dto.active : undefined,
        notes: dto.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
      },
    });

    await this.audit.record({
      userId: userId || null,
      action: 'CATALOGO_UPDATE',
      entity: 'catalog_items',
      entityId: id,
      ip,
      before: { nombre: ya.name, activo: ya.active },
      after: { nombre: item.name, activo: item.active },
    });
    return item;
  }

  /**
   * DESACTIVA. No borra.
   *
   * Una causa usada en 40 órdenes cerradas no se puede borrar sin dejar esas
   * órdenes diciendo un código que ya no significa nada. Desactivada deja de
   * ofrecerse pero el histórico se sigue leyendo.
   */
  async desactivar(id: string, userId?: string | null, ip?: string | null) {
    const ya = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Entrada de catálogo no encontrada');

    const item = await this.prisma.catalogItem.update({
      where: { id },
      data: { active: false },
    });
    await this.audit.record({
      userId: userId || null,
      action: 'CATALOGO_DESACTIVA',
      entity: 'catalog_items',
      entityId: id,
      ip,
      after: { tipo: ya.kind, code: ya.code, nombre: ya.name },
    });
    return item;
  }
}
