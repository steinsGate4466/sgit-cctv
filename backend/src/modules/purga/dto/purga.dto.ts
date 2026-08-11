import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * La confirmación escrita a mano es el freno contra el clic accidental.
 * Un `confirm()` del navegador se acepta por reflejo; escribir el código del
 * activo obliga a mirar CUÁL se está borrando.
 */
export class PurgarDto {
  @IsString() @MaxLength(160) confirmacion!: string;
  /**
   * Segunda llave para lo que trae avisos (orden cerrada, material retirado).
   * No desbloquea nada nuevo: obliga a decir "sé lo que hay dentro", y deja
   * la marca `forzado` en la auditoría.
   */
  @IsOptional() @IsBoolean() forzar?: boolean;
}

export class PurgarAuditoriaDto {
  @IsISO8601() antesDe!: string;
  @IsString() @MaxLength(60) confirmacion!: string;
}
