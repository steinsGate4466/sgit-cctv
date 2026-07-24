import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Crea o actualiza el plan de mantenimiento preventivo de un activo. */
export class UpsertPreventivePlanDto {
  @IsString() assetId: string;
  // Intervalo en días (30 = zona crítica, 60 = no crítica). Si no se envía, se deduce de zoneCritical.
  @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @IsOptional() @IsBoolean() zoneCritical?: boolean;
  @IsOptional() @IsString() lastServiceAt?: string; // ISO
  @IsOptional() @IsBoolean() active?: boolean;
}
