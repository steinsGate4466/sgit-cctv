/* =============================================================================
   DTO DE HOJAS DE RUTA — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: el `@Body() dto: any` de
   guardar deja de entrar sin validar. La clase declara TODAS las claves que
   manda la pantalla (`pages/HojasDeRuta.tsx`) y todas las que lee
   `hojas-ruta.service.ts`. Con `forbidNonWhitelisted`, una clave olvidada
   aquí es un formulario que deja de guardar (bloque 90, Roles).

   La pantalla mandaba la hoja ENTERA tal como llegó del GET (id, createdAt,
   aprobadaPor…). Ahora manda sólo lo que el servicio lee; el resto no
   cambiaba nada y con DTO habría tumbado el guardado.

   El límite de 40 caracteres de SAP lo sigue diciendo el servicio con su
   mensaje: el tope de aquí es más ancho a propósito para no taparlo. Los
   pasos (`operaciones`) también los revisa el servicio.
============================================================================= */
import { Entero, Lista, Numero, SiNo, Texto, UnoDe } from '../../../common/validacion';
import { AssetType } from '../../../generated/prisma/client';

/** POST /hojas-de-ruta — crear o reemplazar la hoja de un tipo de equipo. */
export class GuardarHojaRutaDto {
  @UnoDe(Object.values(AssetType)) tipoEquipo?: string;
  @Texto(500) descripcion?: string;
  @Texto(100) ubicacionSap?: string | null;
  @Texto(100) grupoPlanif?: string | null;
  @Texto(100) frecuencia?: string | null;
  @Texto(100) puestoTrabajo?: string | null;
  @Texto(100) centro?: string | null;
  @Numero() trabajoTotalH?: number | null;
  @Entero() numPersonas?: number | null;
  @Numero() duracionH?: number | null;
  @SiNo() activa?: boolean;
  /** Firma la hoja al guardarla (lo lee el servicio). */
  @SiNo() aprobar?: boolean;
  /** Pasos: `{ operacion, subOperacion, descripcion, … materiales }`. */
  @Lista() operaciones?: unknown[];
}
