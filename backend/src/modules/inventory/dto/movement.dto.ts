import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class MovementDto {
  @IsIn(['INGRESO', 'RETIRO', 'AJUSTE']) type: string;
  // Decimal: retirar 12,5 m de UTP es lo normal, no una excepción.
  @IsNumber() quantity: number;              // cantidad; el signo lo da el tipo
  @IsOptional() @IsString() sapCode?: string; // código SAP del retiro/ingreso
  @IsOptional() @IsString() reason?: string;
}
