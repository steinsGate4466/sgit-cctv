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
          ip: entry.ip ?? null,
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
    const where = { entity: q.entity, action: q.action, userId: q.userId };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, data };
  }
}
