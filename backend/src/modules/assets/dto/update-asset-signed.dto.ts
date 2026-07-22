import { IsEmail, IsString } from 'class-validator';
import { UpdateAssetDto } from './update-asset.dto';

/**
 * Edición FIRMADA de activo. Editar un activo toca información sensible, por eso exige
 * re-autenticación (firma) y queda auditada. Visible solo para Jefe de Mantenimiento,
 * Supervisor TI y Técnico de Red (permiso credential.read).
 */
export class SignedUpdateAssetDto extends UpdateAssetDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
