import { IsEmail, IsOptional, IsString } from 'class-validator';

// Cierre firmado de la OM (correo + contraseña de quien la ejecuta/cierra).
export class CloseWorkOrderDto {
  @IsOptional() @IsString() diagnosis?: string;
  @IsEmail() email: string;
  @IsString() password: string;
}
