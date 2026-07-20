import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditDto {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsIn(['CREATE', 'UPDATE', 'DELETE']) action?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
