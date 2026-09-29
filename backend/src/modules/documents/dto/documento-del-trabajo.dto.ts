import { IsIn, IsString, MaxLength } from 'class-validator';
import { CATEGORIAS } from './subir-documento.dto';

/**
 * Bloque 155 · subir un documento al expediente de una instalación o de una
 * orden. Sólo título y tipo: a QUÉ trabajo pertenece lo pone la ruta, no el
 * formulario, así no se puede colgar en el trabajo de otro.
 */
export class DocumentoDelTrabajoDto {
  @IsString() @MaxLength(160) title!: string;
  @IsIn(CATEGORIAS as any, { message: `El tipo debe ser uno de: ${CATEGORIAS.join(', ')}.` })
  category!: string;
}
