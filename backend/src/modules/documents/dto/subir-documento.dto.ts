import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Espejo del enum DocumentCategory del esquema. */
export const CATEGORIAS = ['MANUAL', 'DIAGRAMA', 'PLANO', 'FOTO', 'CONFIG', 'BACKUP'] as const;

export class SubirDocumentoDto {
  @IsString() @MaxLength(160) title!: string;

  @IsIn(CATEGORIAS as any, { message: `La categoría debe ser una de: ${CATEGORIAS.join(', ')}.` })
  category!: string;

  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() locationId?: string;
}
