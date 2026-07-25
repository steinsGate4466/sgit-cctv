import { IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessMeans, AccessRequestStatus } from '@prisma/client';

/** Solicitud de acceso especial (trabajo en altura / manlift). La llena el técnico. */
export class CreateAccessRequestDto {
  @IsString() assetId: string;
  @IsOptional() @Type(() => Number) @IsNumber() heightMeters?: number;
  @IsOptional() @IsEnum(AccessMeans) means?: AccessMeans;
  @IsOptional() @IsString() locationKind?: string;
  // Sustento obligatorio: el manlift es un recurso caro, debe justificarse.
  @IsString() @MinLength(20, { message: 'La justificación debe ser detallada (mínimo 20 caracteres).' })
  justification: string;
  @IsOptional() @IsString() accessRoute?: string;

  // SSOMA
  @IsOptional() @IsBoolean() requiresPetar?: boolean;
  @IsOptional() @IsBoolean() hasIperc?: boolean;
  @IsOptional() @IsBoolean() hasAts?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) personnelCount?: number;
  @IsOptional() @IsString() eppDetail?: string;
  @IsOptional() @IsString() risks?: string;
  @IsOptional() @IsString() productionImpact?: string;
}

export class UpdateAccessRequestDto {
  @IsOptional() @Type(() => Number) @IsNumber() heightMeters?: number;
  @IsOptional() @IsEnum(AccessMeans) means?: AccessMeans;
  @IsOptional() @IsString() locationKind?: string;
  @IsOptional() @IsString() justification?: string;
  @IsOptional() @IsString() accessRoute?: string;
  @IsOptional() @IsBoolean() requiresPetar?: boolean;
  @IsOptional() @IsBoolean() hasIperc?: boolean;
  @IsOptional() @IsBoolean() hasAts?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) personnelCount?: number;
  @IsOptional() @IsString() eppDetail?: string;
  @IsOptional() @IsString() risks?: string;
  @IsOptional() @IsString() productionImpact?: string;
}

/** Decisión del Jefe de Mantenimiento: aprueba o rechaza, con firma electrónica. */
export class DecideAccessRequestDto {
  @IsEnum(AccessRequestStatus) status: AccessRequestStatus; // APROBADO | RECHAZADO
  @IsOptional() @IsString() decisionNotes?: string;
  @IsEmail() email: string;      // firma
  @IsString() password: string;  // firma
}

export class QueryAccessRequestDto {
  @IsOptional() @IsEnum(AccessRequestStatus) status?: AccessRequestStatus;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() q?: string;
}
