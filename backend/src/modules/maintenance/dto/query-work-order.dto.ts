import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkOrderStatus, WorkOrderType } from '@prisma/client';

export class QueryWorkOrderDto {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsEnum(WorkOrderType) type?: WorkOrderType;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() q?: string;    // texto: código OM, código incidencia, actividad, zona
  @IsOptional() @IsString() from?: string; // ISO (desde) sobre fecha programada
  @IsOptional() @IsString() to?: string;   // ISO (hasta) sobre fecha programada
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
