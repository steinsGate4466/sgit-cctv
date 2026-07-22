import { IsEmail, IsString } from 'class-validator';
import { CreateAssetDto } from './create-asset.dto';

/**
 * Alta de activo FIRMADA. El activo guarda información sensible (IP, red, accesos),
 * por eso registrar uno es una acción crítica: exige re-autenticación (firma) y queda
 * auditada con el firmante.
 */
export class SignedCreateAssetDto extends CreateAssetDto {
  @IsEmail() email: string;      // firma: correo del que registra
  @IsString() password: string;  // firma: contraseña
}
