import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Environment, LocationType } from '../../../generated/prisma/client';

export class CreateLocationDto {
  @IsString() @MinLength(2) code: string;
  @IsString() @MinLength(2) name: string;
  @IsEnum(LocationType) type: LocationType;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() responsibleArea?: string;
  /* Bloque 168 · lo que alimenta la seguridad del trabajo y no se podía editar
     en ninguna pantalla (sólo venía de la semilla). */
  /** Cómo se llega, en texto llano: lo lee el técnico al abrir la orden. */
  @IsOptional() @IsString() @MaxLength(600) howToGet?: string;
  /** La sigla del tren («T1»): va en el rótulo y en el ámbito. Sólo para TREN. */
  @IsOptional() @Matches(/^[A-Z0-9]{1,6}$/, { message: 'La sigla del tren son 1 a 6 letras o números en mayúscula (ej. T1).' }) siglaTren?: string;
  /** Ambiente puntual, cuando el sitio difiere del de su etapa. */
  @IsOptional() @IsEnum(Environment) environment?: Environment;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() responsibleArea?: string;
  /* Bloque 168 · lo que alimenta la seguridad del trabajo y no se podía editar
     en ninguna pantalla (sólo venía de la semilla). */
  /** Cómo se llega, en texto llano: lo lee el técnico al abrir la orden. */
  @IsOptional() @IsString() @MaxLength(600) howToGet?: string;
  /** La sigla del tren («T1»): va en el rótulo y en el ámbito. Sólo para TREN. */
  @IsOptional() @Matches(/^[A-Z0-9]{1,6}$/, { message: 'La sigla del tren son 1 a 6 letras o números en mayúscula (ej. T1).' }) siglaTren?: string;
  /** Ambiente puntual, cuando el sitio difiere del de su etapa. */
  @IsOptional() @IsEnum(Environment) environment?: Environment;
}
