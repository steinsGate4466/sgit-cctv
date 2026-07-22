import { IsOptional, IsString } from 'class-validator';

export class QuerySpareDto {
  @IsOptional() @IsString() q?: string;        // nombre, código SAP, modelo, categoría
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() lowStock?: string; // 'true' -> solo faltantes
}
