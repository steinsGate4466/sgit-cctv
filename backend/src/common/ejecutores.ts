import { BadRequestException } from '@nestjs/common';

/**
 * Bloque 172 · una orden sólo se asigna a quien puede ejecutarla (`wo.update`).
 * Antes el desplegable ofrecía a cualquiera y el servidor lo guardaba: la orden
 * quedaba en la bandeja de alguien que no la puede abrir.
 */
export async function exigirEjecutor(prisma: any, technicianId: string | null | undefined): Promise<void> {
  if (!technicianId) return;
  const n = await prisma.user.count({
    where: { id: technicianId, active: true, role: { permissions: { some: { permission: { code: 'wo.update' } } } } },
  });
  if (!n) {
    throw new BadRequestException('Esa persona no puede ejecutar órdenes (su rol no registra avances). Elige un técnico.');
  }
}
