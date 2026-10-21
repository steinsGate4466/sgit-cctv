import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * REVISIÓN DE FORMULARIOS (20/10) · QUIEN FIRMA TIENE QUE PODER HACERLO.
 *
 * Las acciones firmadas (abrir y cerrar una orden, resolver una incidencia,
 * dar de alta o editar un equipo) piden correo y contraseña de quien firma.
 * El servidor comprobaba que la contraseña fuera buena, pero NO que ese
 * firmante tuviera el permiso de la acción: con la sesión del Jefe abierta,
 * cualquiera podía firmar un cierre con su propio usuario de técnico, y la
 * orden quedaba «cerrada por» alguien que no puede cerrar.
 *
 * Se mantiene que firme otra persona (el supervisor que firma en el teléfono
 * del técnico es un caso real), pero esa persona tiene que tener el permiso.
 * El intento queda en auditoría como cualquier firma fallida.
 */
export async function exigirFirmanteConPermiso(
  prisma: PrismaService,
  firmanteId: string,
  permiso: string,
  registrar: (motivo: string) => Promise<unknown>,
): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: firmanteId },
    select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } },
  });
  const codigos = (u?.role?.permissions || []).map((p: any) => p.permission?.code);
  if (codigos.includes(permiso)) return;
  await registrar(`el firmante no tiene el permiso ${permiso}`).catch(() => null);
  throw new ForbiddenException(
    'Quien firma no tiene permiso para esta acción. Tiene que firmar alguien autorizado.',
  );
}
