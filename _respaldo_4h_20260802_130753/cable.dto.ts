import { IsBoolean, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CableCategory, CableRoute, CableStatus } from '@prisma/client';

/**
 * TRAMO DE CABLE entre dos puntos.
 *
 * Se modela como tramo y no como atributo del equipo porque el límite de
 * Ethernet son 90 m de tramo horizontal, y pasado eso el enlace no falla:
 * falla A VECES. Es la causa del "se arregla y vuelve a fallar" que nadie
 * explica, y no se descubre si nadie anotó que ese tramo mide 118 m.
 */
export class CreateCableDto {
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsEnum(CableCategory) category: CableCategory;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) meters?: number;
  /** true = estimado a ojo · false = medido con metrajo. */
  @IsOptional() @IsBoolean() metersEstimated?: boolean;
  /** Blindado (STP/FTP). Decisivo si el tramo corre junto a fuerza. */
  @IsOptional() @IsBoolean() shielded?: boolean;
  @IsOptional() @IsEnum(CableRoute) route?: CableRoute;
  @IsOptional() @IsEnum(CableStatus) status?: CableStatus;

  /** Equipo de origen (switch, grabador, antena) y puerto del que sale. */
  @IsOptional() @IsString() fromAssetId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) fromPortNumber?: number;
  /** Equipo de destino. */
  @IsOptional() @IsString() toAssetId?: string;

  @IsOptional() @IsISO8601() installedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateCableDto {
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsEnum(CableCategory) category?: CableCategory;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) meters?: number;
  @IsOptional() @IsBoolean() metersEstimated?: boolean;
  @IsOptional() @IsBoolean() shielded?: boolean;
  @IsOptional() @IsEnum(CableRoute) route?: CableRoute;
  @IsOptional() @IsEnum(CableStatus) status?: CableStatus;
  @IsOptional() @IsString() fromAssetId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) fromPortNumber?: number;
  @IsOptional() @IsString() toAssetId?: string;
  @IsOptional() @IsISO8601() installedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class QueryCableDto {
  @IsOptional() @IsEnum(CableStatus) status?: CableStatus;
  @IsOptional() @IsEnum(CableCategory) category?: CableCategory;
  @IsOptional() @IsString() assetId?: string;
  /** true = solo tramos por encima del límite de norma. */
  @IsOptional() @IsString() fueraNorma?: string;

  // ---- Ámbito de planta (3B-2) ----
  @IsOptional() @IsString() tren?: string;
  @IsOptional() @IsString() etapa?: string;
}
