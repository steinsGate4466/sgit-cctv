import { IsEmail, IsString, MinLength } from 'class-validator';
// MinLength sigue en uso para fullName.

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) fullName: string;
  /* Sin @MinLength: la política completa vive en `politica-password.ts` y la
     aplica el servicio, que sí conoce el correo y el nombre. Dejar aquí un
     mínimo distinto daría dos reglas y dos mensajes para lo mismo. */
  @IsString() password: string;
  @IsString() roleId: string;
}
