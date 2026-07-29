import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { RootCause } from '@prisma/client';

/** Cierre firmado de la OM. */
export class CloseWorkOrderDto {
  @IsEmail() email: string;
  @IsString() password: string;

  @IsOptional() @IsString() diagnosis?: string;

  /**
   * Causa encontrada. Es una LISTA y no texto libre porque el técnico cierra
   * contra el reloj de la parada: con texto libre se escribe "se solucionó"
   * y el dato no sirve para saber por qué algo vuelve a fallar.
   */
  @IsOptional() @IsEnum(RootCause) rootCause?: RootCause;
  @IsOptional() @IsString() @MaxLength(500) rootCauseNote?: string;

  /** El técnico marca si el problema ya se había presentado antes. */
  @IsOptional() @IsBoolean() isRecurrent?: boolean;

  /** Hora REAL de cierre. Si no viene, se toma el momento actual. */
  @IsOptional() @IsISO8601() endedAt?: string;
}
