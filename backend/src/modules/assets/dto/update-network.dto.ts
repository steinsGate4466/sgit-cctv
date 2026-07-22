import { IsOptional, IsString } from 'class-validator';

export class UpdateNetworkDto {
  @IsOptional() @IsString() ipAddress?: string;
}
