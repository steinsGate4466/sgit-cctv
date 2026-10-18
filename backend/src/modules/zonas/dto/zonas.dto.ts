import { Fecha, SiNo, Texto, UnoDe } from '../../../common/validacion';

/* =============================================================================
   ZONAS VITALES — lo que declara Producción y lo que firma Mantenimiento
   (bloque 174)
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en `zonas.controller.ts`: eran dos
   `@Body() dto: any`. Cada clase declara TODAS las claves que manda
   `Zonas.tsx` (también por `enviarConRespaldo`, que reenvía el mismo cuerpo
   cuando vuelve la señal) y todas las que lee `zonas.service.ts`. Un campo
   olvidado aquí rechazaría con un 400 una petición buena y el formulario
   dejaría de guardar (bloque 90). No transforman: el servicio convierte.
============================================================================= */

/** Todos los valores del enum `Criticality` de schema.prisma. */
const CRITICIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

/** Todos los valores del enum `Intervencion` de schema.prisma. */
const INTERVENCIONES = [
  'EN_MARCHA', 'CON_PERMISO_ELECTRICO', 'CON_PERMISO_ALTURA', 'EXIGE_PARADA', 'SIN_CLASIFICAR',
] as const;

/** PATCH /zonas/:id — Producción declara la importancia de la zona. */
export class DeclararZonaDto {
  /** null retira la declaración. */
  @UnoDe(CRITICIDADES) criticidadProduccion?: string | null;
  /** Obligatorio para ALTA y CRÍTICA; lo exige el servicio. */
  @Texto(2000) porQueEsVital?: string | null;
  @Texto(2000) impactoSiSeCae?: string | null;
  @Texto(2000) queSeVigila?: string | null;
  @Fecha() revisarAntesDe?: string | null;
}

/** PATCH /zonas/:id/intervencion — firmar cómo se interviene la zona. */
export class FirmarIntervencionDto {
  /** null retira la firma. */
  @UnoDe(INTERVENCIONES) intervencionFirmada?: string | null;
  /** Obligatorio para las opciones permisivas; lo exige el servicio. */
  @Texto(2000) intervencionMotivo?: string | null;
  @SiNo() requiereAltura?: boolean;
}
