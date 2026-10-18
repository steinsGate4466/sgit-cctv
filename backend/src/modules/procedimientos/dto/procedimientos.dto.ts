/* =============================================================================
   DTO DE PROCEDIMIENTOS Y NOTAS DE CAMPO — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los cuatro `@Body() dto: any`
   dejan de entrar sin validar.

   Cada clase declara TODAS las claves que mandan las pantallas
   (`components/CampoDelTurno.tsx` y `pages/Mejoras.tsx`) y todas las que lee
   `procedimientos.service.ts`. Con `forbidNonWhitelisted`, una clave olvidada
   aquí es un formulario que deja de guardar (bloque 90, Roles).

   El aviso y la mejora del QR viajan por `enviarConRespaldo`: si no hay señal
   se guardan en el teléfono y se reenvían tal cual más tarde. Un 400 aquí no
   se reintenta, así que estas dos clases no pueden quedarse cortas.

   · El tipo de aviso es TEXTO, no lista cerrada: el servicio convierte uno
     desconocido en VIGILAR, y eso no se cambia aquí.
   · Los números no se transforman: el servicio decide qué es un número.
============================================================================= */
import { AssetType, EstadoMejora } from '../../../generated/prisma/client';
import { Id, Lista, Numero, SiNo, Texto, UnoDe } from '../../../common/validacion';

/** POST /activos/:id/notas — el aviso para el que llegue después. */
export class DejarNotaDto {
  @Texto(40) tipo?: string;
  @Texto(2000) texto?: string;
  /** El <input> puede mandar `null` (NaN en JSON) si se borra el número. */
  @Numero() diasVigencia?: number;
  @Id() workOrderId?: string;
}

/** POST /procedimientos — alta o edición (con `id`) de un procedimiento. */
export class GuardarProcedimientoDto {
  @Id() id?: string;
  @UnoDe(Object.values(AssetType)) tipoActivo?: string;
  @Texto(200) marca?: string | null;
  @Texto(200) modelo?: string | null;
  @Texto(200) titulo?: string;
  /** Los pasos los limpia y valida el servicio. */
  @Lista() pasos?: unknown[];
  @Texto(4000) advertencias?: string | null;
  @Numero() minutosEstimados?: number | null;
  @SiNo() activo?: boolean;
}

/** POST /procedimientos/:id/mejoras — la mejora propuesta desde campo. */
export class ProponerMejoraDto {
  @Texto(4000) texto?: string;
  @Numero() minutosReales?: number;
  @Id() workOrderId?: string;
}

/** PATCH /procedimientos-mejoras/:id — aceptar o rechazar. */
export class DecidirMejoraDto {
  @UnoDe(Object.values(EstadoMejora)) estado?: string;
  @Texto(2000) motivo?: string;
  @SiNo() comoPaso?: boolean;
}
