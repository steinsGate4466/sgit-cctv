import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssetType, AssetStatus } from '@prisma/client';
export class QueryAssetDto {
  @IsOptional() @IsEnum(AssetType) type?: AssetType;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() search?: string;
}
