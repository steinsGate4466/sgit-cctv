import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Apuntar un equipo en una orden — bloque 110-B.
 *
 * Escrito mirando qué lee el servicio (bloque 85): un campo que falte hace que
 * `forbidNonWhitelisted` rechace una petición buena con un 400, y el formulario
 * deja de guardar sin decir por qué.
 */
export class ApuntarEquipoDto {
  @IsString() @MinLength(1) assetId!: string;

  /** Por defecto INTERVENIDO: apuntar algo en campo es haberlo tocado. */
  @IsOptional() @IsIn(['REPORTADO', 'INTERVENIDO']) papel?: 'REPORTADO' | 'INTERVENIDO';

  /** Del catálogo ACCION, el mismo del cierre. */
  @IsOptional() @IsString() @MaxLength(40) accionCode?: string;

  @IsOptional() @IsString() @MaxLength(300) nota?: string;
}
