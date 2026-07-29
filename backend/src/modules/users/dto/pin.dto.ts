import { IsString, Matches, MinLength } from 'class-validator';

/**
 * PIN de campo del usuario.
 *
 * Sirve para REANUDAR una orden en campo sin teclear la contraseña completa
 * con guantes. La apertura y el cierre de una orden SIEMPRE exigen contraseña:
 * el PIN nunca sustituye a la firma.
 */
export class SetPinDto {
  /** La contraseña actual: el PIN no se puede cambiar sin demostrar identidad. */
  @IsString() password: string;

  /** 4 a 8 dígitos. Solo números: hay que poder escribirlo con guantes. */
  @Matches(/^\d{4,8}$/, { message: 'El PIN debe tener entre 4 y 8 dígitos numéricos.' })
  pin: string;
}

export class VerifyPinDto {
  @IsString() @MinLength(4) pin: string;
}
