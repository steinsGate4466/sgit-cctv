import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

// Mapa método HTTP -> acción de auditoría.
const ACTIONS: Record<string, string> = {
  POST: 'CREATE',
  PATCH: 'UPDATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * AuditInterceptor — registra automáticamente las operaciones de escritura exitosas.
 * Qué hace: tras el handler, si el método es de mutación y la ruta no es de auth,
 * escribe un registro en audit_logs (usuario, acción, entidad, id, resultado, IP).
 * Por qué existe: trazabilidad total del ERP sin ensuciar la lógica de cada servicio.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const action = ACTIONS[req.method];
    const url = String(req.originalUrl || req.url || '');
    const isAudited = !!action && !url.includes('/auth/');

    return next.handle().pipe(
      tap((response) => {
        if (!isAudited) return;
        const entityId =
          (response && typeof response === 'object' && (response as any).id) ||
          req.params?.id ||
          null;
        // Fire-and-forget: no bloquea ni afecta la respuesta.
        void this.audit.record({
          userId: req.user?.userId ?? null,
          action,
          entity: this.entityFromUrl(url),
          entityId,
          after: action === 'DELETE' ? undefined : response,
          ip: (req.headers?.['x-forwarded-for'] as string) || req.ip || null,
        });
      }),
    );
  }

  // Deriva la entidad del path: /api/v1/<entidad>/... -> <entidad>
  private entityFromUrl(url: string): string {
    const parts = url.split('?')[0].split('/').filter(Boolean);
    const i = parts.indexOf('v1');
    return i >= 0 && parts[i + 1] ? parts[i + 1] : 'unknown';
  }
}
