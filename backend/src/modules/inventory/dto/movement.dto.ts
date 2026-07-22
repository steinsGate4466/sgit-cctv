import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class MovementDto {
  @IsIn(['INGRESO', 'RETIRO', 'AJUSTE']) type: string;
  @IsInt() quantity: number;                 // cantidad; el signo lo da el tipo
  @IsOptional() @IsString() sapCode?: string; // código SAP del retiro/ingreso
  @IsOptional() @IsString() reason?: string;
}
