import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Criticality, Environment } from '@prisma/client';

/**
 * Alta de etapa del proceso de laminación.
 * Antes este controlador recibía `any`: sin validación, cualquier cuerpo pasaba
 * y los errores aparecían recién al escribir en la base.
 */
export class CreateStageDto {
  @IsString() @MinLength(2) @MaxLength(40) code: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEnum(Environment) environment: Environment;

  @IsOptional() @IsInt() @Min(1) sequence?: number;
  @IsOptional() @IsEnum(Criticality) baseCriticality?: Criticality;
  @IsOptional() @IsInt() @Min(1) defaultIntervalDays?: number;
  @IsOptional() @IsString() @MaxLength(200) watches?: string;
}

export class UpdateStageDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) sequence?: number;
  @IsOptional() @IsEnum(Environment) environment?: Environment;
  @IsOptional() @IsEnum(Criticality) baseCriticality?: Criticality;
  @IsOptional() @IsInt() @Min(1) defaultIntervalDays?: number;
  @IsOptional() @IsString() @MaxLength(200) watches?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
