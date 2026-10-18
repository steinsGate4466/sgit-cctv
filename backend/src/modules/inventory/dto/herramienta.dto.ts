/* =============================================================================
   DTO DEL CATÁLOGO DE HERRAMIENTAS — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los dos `@Body() dto: any`
   de /inventory/tools dejan de entrar sin validar. Cada clase declara TODAS
   las claves que manda la pantalla (`components/InventarioHerramientas.tsx`,
   que usa el MISMO cuerpo para crear y para editar) y todas las que lee
   `inventory.service.ts`. Con `forbidNonWhitelisted`, una clave olvidada
   aquí es un formulario que deja de guardar (bloque 90, Roles).
============================================================================= */
import { ListaDeTextos, SiNo, Texto } from '../../../common/validacion';

/** POST /inventory/tools — el nombre obligatorio lo exige el servicio. */
export class CrearHerramientaDto {
  @Texto(50) code?: string;
  @Texto(200) name?: string;
  @Texto(200) category?: string;
  @Texto(2000) notes?: string;
  /** Tipos de orden en los que se sugiere. Vacía = en todas. */
  @ListaDeTextos(80) suggestedFor?: string[];
}

/** PATCH /inventory/tools/:toolId — la pantalla manda también `code`, que el servicio ignora. */
export class ActualizarHerramientaDto extends CrearHerramientaDto {
  @SiNo() active?: boolean;
}
