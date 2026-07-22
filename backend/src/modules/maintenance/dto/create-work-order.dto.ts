import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderType } from '@prisma/client';

export class CreateWorkOrderDto {
  @IsOptional() @IsString() code?: string;       // opcional: código manual (OM-2026-...)
  @IsEnum(WorkOrderType) type: WorkOrderType;     // PREVENTIVO | CORRECTIVO | MEJORA
  @IsString() assetId: string;
  @IsOptional() @IsString() activity?: string;    // qué se va a hacer
  @IsOptional() @IsString() responsible?: string; // responsable de la OM
  @IsOptional() @IsString() materials?: string;   // materiales usados / a usar
  @IsOptional() @IsString() zone?: string;        // zona de intervención (Horno, Tren, Púlpito...)
  @IsOptional() @IsString() incidentId?: string;  // incidencia que origina la OM
  @IsOptional() @IsString() scheduledDate?: string; // ISO
  @IsOptional() @IsString() technicianId?: string;
}
