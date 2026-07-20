import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { AssetType, AssetStatus, Criticality } from '@prisma/client';

export class CreateAssetDto {
  // Convención de nomenclatura: AA-<TIPO>-T<n>-<zona>-<###>  (ej: AA-CAM-T1-FX-001)
  @Matches(/^AA-[A-Z]{2,4}-T[1-3]-[A-Z0-9]{1,4}-\d{3}$/, {
    message: 'assetCode debe seguir el patrón AA-CAM-T1-FX-001',
  })
  assetCode: string;

  @IsEnum(AssetType) type: AssetType;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(Criticality) criticality?: Criticality;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() sapId?: string;
  @IsOptional() @IsString() costCenter?: string;
  @IsOptional() @IsString() responsibleArea?: string;
}
