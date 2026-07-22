import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CheckDto {
  @IsInt() @Min(0) countedQty: number;   // cantidad física comprobada
  @IsOptional() @IsString() note?: string;
}
