import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { RootCause } from '../../../generated/prisma/client';

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

  /**
   * CÓDIGO de causa del catálogo editable (3E). Es la fuente de verdad de aquí
   * en adelante: admite las 17 de siempre y las que ustedes creen.
   * Se valida como texto porque el conjunto válido vive en la base, no en el
   * código — que es justo el punto de 3E.
   */
  @IsOptional() @IsString() @MaxLength(60) rootCauseCode?: string;

  /** Qué VIO antes de intervenir. Catálogo SINTOMA. */
  @IsOptional() @IsString() @MaxLength(60) symptomCode?: string;

  /** Qué HIZO. Catálogo ACCION. */
  @IsOptional() @IsString() @MaxLength(60) actionCode?: string;

  /**
   * Observación libre. Ahora es la VÁLVULA DE ESCAPE, no el sitio donde vive
   * la información: si se usa mucho, es que a las listas les falta una opción.
   */
  @IsOptional() @IsString() @MaxLength(500) rootCauseNote?: string;

  /** El técnico marca si el problema ya se había presentado antes. */
  @IsOptional() @IsBoolean() isRecurrent?: boolean;

  /** Hora REAL de cierre. Si no viene, se toma el momento actual. */
  @IsOptional() @IsISO8601() endedAt?: string;
}
