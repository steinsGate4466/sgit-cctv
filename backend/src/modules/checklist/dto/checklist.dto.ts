/* =============================================================================
   DTO DE RUTINAS PREVENTIVAS — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los cinco `@Body() body: any`
   dejan de entrar sin validar.

   Cada clase declara TODAS las claves que mandan las pantallas
   (`components/RutinasEditor.tsx` y `components/RutinaEnCampo.tsx`) y todas
   las que lee `checklist.service.ts`. Con `forbidNonWhitelisted`, una clave
   olvidada aquí es un formulario que deja de guardar (bloque 90, Roles).

   Nada es obligatorio aquí: «indica el tipo», «escribe qué hay que comprobar»
   y «falta el punto o el resultado» los sigue diciendo el servicio con sus
   palabras. El tope del texto del punto es más ancho que el del servicio
   (200) a propósito, para que el mensaje que se lea sea el suyo.
============================================================================= */
import { AssetType, ChecklistResult } from '../../../generated/prisma/client';
import { Entero, Id, SiNo, Texto, UnoDe } from '../../../common/validacion';

/** POST /checklist/plantillas */
export class CrearPlantillaDto {
  @UnoDe(Object.values(AssetType)) assetType?: string;
  @Texto(200) name?: string;
}

/** PATCH /checklist/plantillas/:id */
export class ActualizarPlantillaDto {
  @Texto(200) name?: string;
  @SiNo() active?: boolean;
}

/** POST /checklist/plantillas/:id/puntos */
export class AgregarPuntoDto {
  @Texto(400) text?: string;
  /** Al editar llega `null` si el punto no tenía ayuda. */
  @Texto(2000) help?: string | null;
  @Entero() sequence?: number | string;
  @SiNo() critical?: boolean;
}

/** PATCH /checklist/puntos/:id */
export class ActualizarPuntoDto extends AgregarPuntoDto {
  @SiNo() active?: boolean;
}

/** POST /checklist/orden/:woId — responder un punto de la rutina. */
export class ResponderPuntoDto {
  @Id() itemId?: string;
  @UnoDe(Object.values(ChecklistResult)) result?: string;
  @Texto(4000) note?: string | null;
}
