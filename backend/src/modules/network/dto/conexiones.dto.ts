import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

  /** 802.1Q: 1–4094 (0 y 4095 están reservados). Bloque 173. */
  @IsOptional() @Type(() => Number)
  @IsInt({ message: 'La VLAN tiene que ser un número entero.' })
  @Min(1, { message: 'La VLAN va de 1 a 4094.' })
  @Max(4094, { message: 'La VLAN va de 1 a 4094 (802.1Q).' })
  vlan?: number | null;
}

/** Bloque 173 · declarar cuántos puertos tiene el switch desde Conexiones. */
export class DeclararPuertosDto {
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de puertos tiene que ser un número entero.' })
  @Min(1) @Max(96)
  puertos!: number;

  @IsOptional() @Type(() => Number)
  @IsInt({ message: 'Los puertos PoE tienen que ser un número entero.' })
  @Min(0) @Max(96)
  poe?: number | null;
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
