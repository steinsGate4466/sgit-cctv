import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AssetType, AssetStatus, Criticality } from '@prisma/client';

export class CreateAssetDto {
  // Código / rótulo del activo. Formato LIBRE: el estándar de rotulamiento de Aceros
  // aún no está definido; cuando se estandarice, se hará configurable.
  @IsString()
  @MinLength(2)
  assetCode: string;

  @IsEnum(AssetType) type: AssetType;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() referencePlace?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(Criticality) criticality?: Criticality;
  // NOTA: el campo `train` se retiró de la API a propósito.
  // El tren se DEDUCE del árbol de ubicaciones (common/plant-context.ts).
  // Aceptarlo aquí mantenía viva la doble jerarquía que se corrigió en F8:
  // se podía crear un activo colgado del Tren 2 y declararlo como TREN_1.
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() sapId?: string;
  @IsOptional() @IsString() costCenter?: string;
  @IsOptional() @IsString() responsibleArea?: string;
}
