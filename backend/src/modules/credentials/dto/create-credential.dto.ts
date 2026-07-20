import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @IsString() assetId: string;
  @IsString() username: string;
  @IsString() @MinLength(1) secret: string;
  @IsOptional() @IsString() type?: string; // admin, viewer, rtsp...
}
