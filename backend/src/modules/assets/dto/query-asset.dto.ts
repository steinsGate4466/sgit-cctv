import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssetType, AssetStatus, PlantTrain } from '@prisma/client';

export class QueryAssetDto {
  @IsOptional() @IsEnum(AssetType) type?: AssetType;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsEnum(PlantTrain) train?: PlantTrain;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() search?: string;
}
