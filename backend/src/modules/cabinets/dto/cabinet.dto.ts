import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCabinetDto {
  @IsString() @MinLength(2) code: string;   // rótulo del gabinete (ej. GAB-T1-R01)
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() referencePlace?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCabinetDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() referencePlace?: string;
  @IsOptional() @IsString() notes?: string;
}
