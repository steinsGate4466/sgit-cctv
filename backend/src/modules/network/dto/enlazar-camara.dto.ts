import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO de verdad, no `@Body() dto: any`.
 *
 * Aquí importa especialmente: el canal llega de un <input type="number">, que
 * manda TEXTO. Sin `@Type(() => Number)` entraría como "7" y las
 * comprobaciones de rango del servicio compararían una cadena con un número,
 * que en JavaScript da resultados que parecen correctos hasta que no lo son.
 */
export class EnlazarCamaraDto {
  @IsString()
  assetId!: string;

  /** null = enlazada al grabador pero sin canal asignado todavía. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El canal tiene que ser un número entero.' })
  @Min(1, { message: 'Los canales empiezan en 1.' })
  canal?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombreEnGrabador?: string | null;
}
