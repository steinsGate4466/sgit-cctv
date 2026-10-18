import { Fecha, Id, Lista, SiNo, Texto } from '../../../common/validacion';

/* =============================================================================
   CAMPAÑAS DE MAPEO (bloque 174)
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en `campanas.controller.ts`: eran tres
   `@Body() dto: any`. Cada clase declara TODAS las claves que manda
   `Campanas.tsx` y todas las que lee `campanas.service.ts`. Un campo olvidado
   aquí rechazaría con un 400 una petición buena y el formulario dejaría de
   guardar (bloque 90). No transforman: el servicio convierte.
============================================================================= */

/** POST /campanas — nueva campaña. */
export class CrearCampanaDto {
  @Texto(200) nombre?: string;
  /**
   * Texto y no `UnoDe`: `aTrenDePlanta()` acepta TREN_1, T1 y las demás formas
   * (bloque 172), y '' significa «todos».
   */
  @Texto(40) tren?: string;
  @Texto(2000) descripcion?: string;
  @Id() responsableId?: string;
  @Fecha() inicioPrevisto?: string;
  @Fecha() finPrevisto?: string;
}

/**
 * POST /campanas/:id/zonas — repartir zonas.
 * Cada fila es `{ locationId, asignadoAId?, esperados?, notas? }`; su contenido
 * lo trata el servicio fila a fila.
 */
export class RepartirZonasDto {
  @Lista() zonas?: Array<{ locationId: string; asignadoAId?: string; esperados?: number; notas?: string }>;
}

/** PATCH /campanas/zona/:zonaId/decidir — aprobar o devolver. */
export class DecidirZonaDto {
  @SiNo() aprobar?: boolean;
  /** Obligatorio al devolver; lo exige el servicio. */
  @Texto(2000) observaciones?: string;
}
