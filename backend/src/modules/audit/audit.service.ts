import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

export interface AuditEntry {
  userId?: string | null;
  action: string; // CREATE | UPDATE | DELETE
  entity: string; // recurso afectado (assets, users, ...)
  entityId?: string | null;
  before?: any;
  after?: any;
  ip?: string | null;
}

/**
 * AuditService — escribe y consulta el historial de auditoría (audit_logs).
 * La escritura NUNCA debe romper la operación principal: los errores se silencian.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normaliza la dirección de origen para que la traza sea legible y útil.
   *  - Node antepone "::ffff:" a las IPv4 (::ffff:190.12.3.4 → 190.12.3.4).
   *  - "::1" y "127.0.0.1" son accesos desde el propio servidor.
   *  - Si vienen varias IP separadas por coma (cadena de proxies), la primera
   *    es la del cliente real.
   */
  private normalizeIp(ip?: string | null): string | null {
    if (!ip) return null;
    let v = String(ip).trim();
    if (!v) return null;
    // Marcas internas del sistema (tareas automáticas): se dejan tal cual.
    if (v.startsWith('sistema')) return v;
    if (v.includes(',')) v = v.split(',')[0].trim();
    if (v.startsWith('::ffff:')) v = v.slice(7);
    if (v === '::1' || v === '127.0.0.1') return 'local (servidor)';
    return v;
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: entry.before ?? undefined,
          after: entry.after ?? undefined,
          ip: this.normalizeIp(entry.ip),
        },
      });
    } catch {
      // Silencioso a propósito.
    }
  }

  /**
   * Lista el historial de auditoría con filtros y paginación.
   * Qué recibe: filtros opcionales (entity, action, userId) + page/pageSize.
   * Qué devuelve: { page, pageSize, total, data }.
   */
  async findMany(q: QueryAuditDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;
    const where: any = { entity: q.entity, action: q.action, userId: q.userId };
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { fullName: true, email: true } } },
      }),
    ]);
    return { page, pageSize, total, data };
  }
}
