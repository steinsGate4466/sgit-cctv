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
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() sapId?: string;
  @IsOptional() @IsString() costCenter?: string;
  @IsOptional() @IsString() responsibleArea?: string;
}
