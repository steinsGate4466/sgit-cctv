import { IsString } from 'class-validator';

export class LinkAssetDto {
  @IsString() assetId: string;
}
