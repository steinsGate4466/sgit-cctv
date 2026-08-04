import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO de verdad, no `@Body() dto: any`. Aquí importa especialmente porque los
 * números llegan de <input type="number">, que manda TEXTO: sin
 * `@Type(() => Number)` entraría "8" y las comparaciones de rango darían
 * resultados que parecen correctos hasta que no lo son.
 */
export class GuardarPuertoDto {
  @IsString() switchId!: string;

  @Type(() => Number)
  @IsInt({ message: 'El número de puerto tiene que ser un entero.' })
  @Min(1, { message: 'Los puertos empiezan en 1.' })
  numero!: number;

  /** null = puerto libre. */
  @IsOptional() @IsString() connectedAssetId?: string | null;

  @IsOptional() @IsBoolean() poe?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) vlan?: number | null;
}

/** Medios admitidos por el enum LinkMedium del esquema. */
const MEDIOS = ['FIBRA', 'COBRE', 'INALAMBRICO'];

export class CrearEnlaceDto {
  @IsString() endpointAId!: string;
  @IsString() endpointBId!: string;

  @IsOptional()
  @IsIn(MEDIOS, { message: `El medio debe ser uno de: ${MEDIOS.join(', ')}.` })
  medium?: string;

  @IsOptional() @IsBoolean() isRing?: boolean;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}
