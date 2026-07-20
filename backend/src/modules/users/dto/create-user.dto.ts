import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) fullName: string;
  @IsString() @MinLength(8) password: string;
  @IsString() roleId: string;
}
