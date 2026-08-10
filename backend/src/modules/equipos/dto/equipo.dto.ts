import { IsBoolean, IsIn, IsIP, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const TIPOS_EQUIPO = ['PC', 'LAPTOP', 'CELULAR', 'TABLET', 'SERVIDOR', 'OTRO'] as const;

/**
 * La MAC se acepta en los tres formatos que devuelven los equipos de red:
 *   00:1A:2B:3C:4D:5E   ·   00-1A-2B-3C-4D-5E   ·   001A.2B3C.4D5E (Cisco)
 * Se normaliza a uno solo en el servicio: si no, la misma tarjeta entra dos
 * veces con dos formatos y el índice único no lo impide.
 */
const MAC = /^([0-9A-Fa-f]{2}([:-])){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

export class CrearEquipoDto {
  @IsString() @MinLength(2) @MaxLength(80) nombre!: string;
  @IsOptional() @IsIP() ip?: string;
  @IsOptional() @Matches(MAC, { message: 'MAC no válida. Ejemplo: 00:1A:2B:3C:4D:5E' }) mac?: string;
  @IsOptional() @IsIn(TIPOS_EQUIPO as unknown as string[]) tipo?: string;
  @IsOptional() @IsString() @MaxLength(60) area?: string;
  @IsOptional() @IsString() @MaxLength(120) ubicacion?: string;
  @IsOptional() @IsString() @MaxLength(80) responsable?: string;
  @IsOptional() @IsString() @MaxLength(400) notas?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class EditarEquipoDto extends CrearEquipoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) declare nombre: string;
}
