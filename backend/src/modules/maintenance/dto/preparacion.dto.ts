import { Id, ListaDeTextos, Numero, Texto } from '../../../common/validacion';

/* =============================================================================
   PREPARACIÓN DE LA ORDEN — materiales, retiro y reemplazo (bloque 174)
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en `preparacion.controller.ts`: eran cuatro
   `@Body() body: any`. Cada clase declara TODAS las claves que manda la
   pantalla (`OmMateriales.tsx`) y todas las que lee `preparacion.service.ts`.
   Un campo olvidado aquí rechazaría con un 400 una petición buena y el
   formulario dejaría de guardar (bloque 90). Los decoradores no transforman:
   el servicio sigue haciendo su conversión como hasta ahora.
============================================================================= */

/** POST /work-orders/:id/materials — el técnico pide un material. */
export class AgregarMaterialDto {
  /** Repuesto del catálogo; si viene, el código SAP se copia de él. */
  @Id() sparePartId?: string;
  /** Material escrito a mano, o descripción que pisa la del catálogo. */
  @Texto(1000) description?: string;
  @Numero() plannedQty?: number;
  @Numero() usedQty?: number;
  @Texto(40) unit?: string;
}

/** PATCH /work-orders/:id/materials/:materialId — ajustar cantidades. */
export class ActualizarMaterialDto {
  @Numero() plannedQty?: number;
  @Numero() usedQty?: number;
  @Texto(1000) description?: string;
}

/**
 * POST /work-orders/:id/materials/retiro — el ingeniero firma la salida.
 * La pantalla manda `{}` (todo lo solicitado); `itemIds` permite autorizar
 * sólo una parte y `nota` acompaña al movimiento de almacén.
 */
export class GenerarRetiroDto {
  @ListaDeTextos(80) itemIds?: string[];
  @Texto(1000) nota?: string;
}

/** POST /work-orders/:id/swaps — qué equipo salió y cuál entró. */
export class RegistrarReemplazoDto {
  @Id() removedAssetId?: string;
  @Id() installedAssetId?: string;
  @Texto(2000) note?: string;
}
