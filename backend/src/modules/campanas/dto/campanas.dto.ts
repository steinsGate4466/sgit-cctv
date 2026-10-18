import { Entero, Fecha, Id, Lista, SiNo, Texto, UnoDe } from '../../../common/validacion';

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
  /** Bloque 175 · libre: Mapeo, Instalación, Rotulado… */
  @Texto(60) tipo?: string;
  /** En qué se mide la meta: «equipos», «rótulos», «metros»… */
  @Texto(40) unidad?: string;
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

/** PATCH /campanas/:id — bloque 175 · cambiar el plan o el estado. */
export class EditarCampanaDto {
  @Texto(200) nombre?: string;
  @Texto(60) tipo?: string;
  @Texto(40) unidad?: string;
  @Texto(40) tren?: string;
  @Texto(2000) descripcion?: string;
  @Id() responsableId?: string;
  @Fecha() inicioPrevisto?: string;
  @Fecha() finPrevisto?: string;
  @UnoDe(['PLANIFICADA', 'EN_CURSO', 'EN_REVISION', 'CERRADA', 'CANCELADA']) estado?: string;
  /** Obligatorio al cancelar; lo exige el servicio y va a la auditoría. */
  @Texto(500) motivo?: string;
}

/** PATCH /campanas/zona/:zonaId — bloque 175 · el plan de una zona. */
export class EditarZonaDto {
  @Id() asignadoAId?: string;
  @Entero() esperados?: number | string;
  @Fecha() inicioPrevisto?: string;
  @Fecha() finPrevisto?: string;
  @Texto(2000) notas?: string;
}

/** PATCH /campanas/zona/:zonaId/avance — bloque 175 · cuánto se lleva hecho. */
export class AnotarAvanceDto {
  @Entero() hechos?: number | string;
  @Texto(2000) notas?: string;
}
