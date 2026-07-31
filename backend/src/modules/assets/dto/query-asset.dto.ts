import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType, AssetStatus } from '@prisma/client';

export class QueryAssetDto {
  @IsOptional() @IsEnum(AssetType) type?: AssetType;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() search?: string;

  // ---- Ámbito de planta (3B-2) ----
  // Código de la ubicación de tipo TREN y código de la etapa del proceso.
  // No son columnas del activo: se resuelven contra el árbol.
  @IsOptional() @IsString() tren?: string;
  @IsOptional() @IsString() etapa?: string;

  // ---- Paginación (F9) ----
  // Sin esto el listado traía el inventario completo en cada apertura.
  // @Type convierte el texto de la URL a número; sin él la validación falla
  // porque los parámetros de consulta siempre llegan como cadena.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize?: number;
}
