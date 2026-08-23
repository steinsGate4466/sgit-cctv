import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentCategory, IncidentStatus, Priority } from '../../../generated/prisma/client';

export class QueryIncidentDto {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() q?: string;    // código, título, zona
  @IsOptional() @IsString() from?: string;  // ISO (fecha de reporte)
  @IsOptional() @IsString() to?: string;
  // ---- Ámbito de planta (3B-2) ----
  @IsOptional() @IsString() tren?: string;
  @IsOptional() @IsString() etapa?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
