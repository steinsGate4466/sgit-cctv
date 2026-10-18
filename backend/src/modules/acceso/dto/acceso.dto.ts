/* =============================================================================
   DTO DE ACCESO POR DISPOSITIVO — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los dos `@Body() dto: any`
   dejan de entrar sin validar. Cada clase declara TODAS las claves que manda
   la pantalla (`pages/Equipos.tsx`) y todas las que lee `acceso.service.ts`.
   Con `forbidNonWhitelisted`, una clave olvidada aquí es un botón que deja de
   funcionar (bloque 90, Roles).
============================================================================= */
import { Id, Texto, UnoDe } from '../../../common/validacion';
import { EstadoDispositivo } from '../../../generated/prisma/client';

/**
 * POST /acceso-dispositivos/modo — LIBRE | AVISAR | ESTRICTO. Se deja como
 * texto: el servicio ya lo rechaza con su «Modo no válido.».
 */
export class CambiarModoAccesoDto {
  @Texto(20) modo?: string;
}

/** PATCH /acceso-dispositivos/:id — aprobar, bloquear o devolver a pendiente. */
export class DecidirDispositivoDto {
  /* El servicio no lo comprueba y lo pasa tal cual a la base: aquí sí hace
     falta la lista cerrada, o un valor raro sería un 500 en vez de un 400. */
  @UnoDe(Object.values(EstadoDispositivo)) estado?: string;
  @Texto(200) nombre?: string;
  @Id() equipoConocidoId?: string;
  @Texto(1000) motivo?: string;
}
