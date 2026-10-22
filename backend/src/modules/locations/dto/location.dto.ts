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
  /** BLOQUE 180 · La UBICACIÓN TÉCNICA de SAP («1221AE0303»): la pide el aviso de
      SAP. Se declara una vez aquí y la heredan los equipos que cuelgan de ella.
      '' la borra. Hasta 40 caracteres, que es lo que admite SAP. */
  @IsOptional() @IsString() @MaxLength(40, { message: 'La ubicación técnica de SAP tiene como mucho 40 caracteres.' })
  @Matches(/^[A-Za-z0-9._\-/ ]*$/, { message: 'La ubicación técnica de SAP lleva letras, cifras y separadores (- . / _), como en SAP.' })
  sapLocationCode?: string;
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
  /** BLOQUE 180 · La UBICACIÓN TÉCNICA de SAP («1221AE0303»): la pide el aviso de
      SAP. Se declara una vez aquí y la heredan los equipos que cuelgan de ella.
      '' la borra. Hasta 40 caracteres, que es lo que admite SAP. */
  @IsOptional() @IsString() @MaxLength(40, { message: 'La ubicación técnica de SAP tiene como mucho 40 caracteres.' })
  @Matches(/^[A-Za-z0-9._\-/ ]*$/, { message: 'La ubicación técnica de SAP lleva letras, cifras y separadores (- . / _), como en SAP.' })
  sapLocationCode?: string;
}
