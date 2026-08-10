import { IsISO8601, IsString, MaxLength } from 'class-validator';

/**
 * La confirmación escrita a mano es el freno contra el clic accidental.
 * Un `confirm()` del navegador se acepta por reflejo; escribir el código del
 * activo obliga a mirar CUÁL se está borrando.
 */
export class PurgarDto {
  @IsString() @MaxLength(160) confirmacion!: string;
}

export class PurgarAuditoriaDto {
  @IsISO8601() antesDe!: string;
  @IsString() @MaxLength(60) confirmacion!: string;
}
