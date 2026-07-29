import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkOrderType, RequestChannel } from '@prisma/client';

export class CreateWorkOrderDto {
  @IsOptional() @IsString() code?: string;        // opcional: código manual
  @IsEnum(WorkOrderType) type: WorkOrderType;     // PREVENTIVO | CORRECTIVO | MEJORA | PREDICTIVO | MAPEO

  /**
   * Activo Y ubicación son OPCIONALES, pero al menos uno debe venir.
   * Se valida en el servicio y no aquí porque class-validator no expresa bien
   * la regla "uno u otro" y el mensaje de error saldría confuso.
   *
   * - Orden sobre un equipo concreto -> assetId
   * - Orden de MAPEO o que cubre una zona -> locationId
   */
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() locationId?: string;

  @IsOptional() @IsString() activity?: string;
  @IsOptional() @IsString() responsible?: string;
  @IsOptional() @IsString() materials?: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() incidentId?: string;
  @IsOptional() @IsISO8601() scheduledDate?: string;
  @IsOptional() @IsString() technicianId?: string;

  // ---- Recepción del pedido de Producción ----
  @IsOptional() @IsString() @MaxLength(120) requestedBy?: string;
  @IsOptional() @IsEnum(RequestChannel) requestChannel?: RequestChannel;
  @IsOptional() @IsISO8601() receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(60) externalRef?: string; // número en SAP

  /**
   * Hora de parada ESTIMADA por Producción. Es tentativa: la real la confirma
   * el técnico por radio cuando ya está en campo.
   */
  @IsOptional() @IsISO8601() plannedStopAt?: string;
}
