import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CheckDto {
  // Decimal: contar cable es medirlo. 12,5 m es una cantidad válida.
  @IsNumber() @Min(0) countedQty: number;   // cantidad física comprobada
  @IsOptional() @IsString() note?: string;
}
