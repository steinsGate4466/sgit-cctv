/* =============================================================================
   DTO DE CATÁLOGOS EDITABLES — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los dos `@Body() body: any`
   dejan de entrar sin validar. Cada clase declara TODAS las claves que manda
   la pantalla (`components/CatalogosEditables.tsx`) y todas las que lee
   `catalogos.service.ts`. Con `forbidNonWhitelisted`, una clave olvidada aquí
   es un formulario que deja de guardar (bloque 90, Roles).

   El tipo y el nombre los valida el servicio con sus mensajes de planta
   («Tipo de catálogo desconocido», «máximo 120»): los topes de aquí son más
   anchos a propósito para no taparlos.
============================================================================= */
import { Entero, SiNo, Texto } from '../../../common/validacion';

/** POST /catalogos */
export class CrearCatalogoDto {
  @Texto(60) kind?: string;
  /** Vacío a propósito: el servidor lo genera del nombre. */
  @Texto(120) code?: string;
  @Texto(500) name?: string;
  @Texto(200) group?: string | null;
  @Entero() sequence?: number | string | null;
  @Texto(2000) notes?: string | null;
}

/** PATCH /catalogos/:id — el código no se cambia nunca desde aquí. */
export class ActualizarCatalogoDto {
  @Texto(500) name?: string;
  @Texto(200) group?: string | null;
  @Entero() sequence?: number | string | null;
  @Texto(2000) notes?: string | null;
  @SiNo() active?: boolean;
}
