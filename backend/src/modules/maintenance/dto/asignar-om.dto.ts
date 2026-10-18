import { Fecha, Id, Numero, Texto, UnoDe } from '../../../common/validacion';

/* =============================================================================
   ASIGNAR, CONVERTIR UNA INCIDENCIA Y DETALLAR LA ORDEN (bloque 174)
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en `maintenance.controller.ts`: los tres
   `@Body() body: any` que quedaban (asignar, desde-incidencia y detallar).
   Cada clase declara TODAS las claves que mandan `AsignarOm.tsx` y
   `DetallarOm.tsx`, y todas las que lee `maintenance.service.ts`. Un campo
   olvidado aquí rechazaría con un 400 una petición buena y el formulario
   dejaría de guardar (bloque 90). No transforman: el servicio convierte.
============================================================================= */

/** Todos los valores del enum `WorkOrderType` de schema.prisma. */
const TIPOS_DE_ORDEN = ['PREVENTIVO', 'CORRECTIVO', 'MEJORA', 'PREDICTIVO', 'MAPEO'] as const;

/** POST /work-orders/asignar — la orden rápida del ingeniero. */
export class AsignarOmDto {
  @UnoDe(TIPOS_DE_ORDEN) type?: string;
  /** Lo exige el servicio con su mensaje («Escribe qué hay que hacer.»). */
  @Texto(10000) activity?: string;
  @Id() assetId?: string | null;
  @Id() locationId?: string | null;
  @Id() incidentId?: string | null;
  @Id() technicianId?: string | null;
  @Fecha() scheduledDate?: string;
}

/**
 * POST /work-orders/desde-incidencia/:incidentId — mismo formulario que
 * asignar; la incidencia la pone la ruta, no el cuerpo.
 */
export class DesdeIncidenciaDto {
  @UnoDe(TIPOS_DE_ORDEN) type?: string;
  @Texto(10000) activity?: string;
  @Id() assetId?: string | null;
  @Id() technicianId?: string | null;
  @Fecha() scheduledDate?: string;
}

/** PATCH /work-orders/:id/detallar — lo que completa el técnico. */
export class DetallarOmDto {
  /** `null` es válido: «sin equipo concreto». */
  @Id() assetId?: string | null;
  @Id() locationId?: string | null;
  @Texto(10000) activity?: string;
  /** `null` borra la estimación; el servicio hace `Number(x) || null`. */
  @Numero() plannedDurationMin?: number | null;
  @Fecha() plannedStopAt?: string;
  @Id() technicianId?: string | null;
  /** Obligatorio sólo si cambia el equipo; lo exige el servicio. */
  @Texto(2000) scopeNote?: string;
}
