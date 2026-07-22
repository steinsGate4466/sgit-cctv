import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateSpareDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() sapCode?: string;      // código SAP libre
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;        // modelo compatible
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() warehouse?: string;
  @IsOptional() @IsInt() @Min(0) currentStock?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
}
