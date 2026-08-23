import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { IncidentCategory, Priority } from '../../../generated/prisma/client';

export class CreateIncidentDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() zone?: string;   // área/zona (Horno, Laminación, Púlpito...)
  @IsOptional() @IsInt() concurrentSessions?: number;
  @IsOptional() @IsInt() affectedCameras?: number;
  @IsOptional() @IsInt() visionDownMin?: number;
}
