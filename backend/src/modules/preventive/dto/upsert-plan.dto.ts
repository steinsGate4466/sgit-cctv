import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Crea o actualiza el plan de mantenimiento preventivo de un activo. */
export class UpsertPreventivePlanDto {
  @IsString() assetId: string;
  // Intervalo en meses (3 = zona crítica, 6 = no crítica). Si no se envía, se deduce de zoneCritical.
  @IsOptional() @IsInt() @Min(1) intervalMonths?: number;
  @IsOptional() @IsBoolean() zoneCritical?: boolean;
  @IsOptional() @IsString() lastServiceAt?: string; // ISO
  @IsOptional() @IsBoolean() active?: boolean;
}
