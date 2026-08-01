import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateSpareDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() sapCode?: string;      // código SAP libre
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;        // modelo compatible
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() warehouse?: string;
  // Decimales: el cable se guarda en metros, no en unidades enteras.
  @IsOptional() @IsNumber() @Min(0) currentStock?: number;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
}
