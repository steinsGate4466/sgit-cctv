import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { LocationType } from '../../../generated/prisma/client';

export class CreateLocationDto {
  @IsString() @MinLength(2) code: string;
  @IsString() @MinLength(2) name: string;
  @IsEnum(LocationType) type: LocationType;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() responsibleArea?: string;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() responsibleArea?: string;
}
