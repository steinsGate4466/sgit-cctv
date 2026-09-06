import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/* BLOQUE 98 · Los plazos prometidos, en horas.
   Campos EXACTOS y ninguno de más: el `ValidationPipe` corre con
   `forbidNonWhitelisted`, así que un campo que sobre rechaza la petición
   entera — fue lo que dejó sin guardar la pantalla de Roles (bloque 90). */
export class SlaDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) criticaRespuestaH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) criticaRestitucionH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) altaRespuestaH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) altaRestitucionH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) mediaRespuestaH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) mediaRestitucionH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) bajaRespuestaH!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8760) bajaRestitucionH!: number;
}
