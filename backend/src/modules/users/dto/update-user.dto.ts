import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

// Todos los campos de creación son opcionales al actualizar, más `active`.
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}
