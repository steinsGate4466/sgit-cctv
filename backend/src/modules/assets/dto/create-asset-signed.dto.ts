import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAssetDto } from './create-asset.dto';
import {
  CameraSpecDto, NvrSpecDto, SwitchSpecDto, WirelessSpecDto,
  DecoderSpecDto, ScreenSpecDto, PcSpecDto,
} from './asset-specs.dto';

/**
 * Alta de activo FIRMADA, con la FICHA PROPIA de su tipo.
 *
 * El activo guarda información sensible (IP, red, accesos) y por eso el alta
 * exige re-autenticación y queda auditada con el firmante.
 *
 * El bloque de ficha que se envíe debe corresponder al tipo declarado: se
 * valida en el servicio, no aquí, porque la regla "el bloque tiene que
 * coincidir con el tipo" no se expresa bien con decoradores y el mensaje de
 * error saldría incomprensible.
 *
 * @ValidateNested + @Type son necesarios: sin ellos la validación global
 * (whitelist + forbidNonWhitelisted) descartaría el objeto anidado entero y
 * la ficha llegaría vacía al servicio sin ningún aviso.
 */
export class SignedCreateAssetDto extends CreateAssetDto {
  @IsEmail() email: string;      // firma: correo del que registra
  @IsString() password: string;  // firma: contraseña

  @IsOptional() @ValidateNested() @Type(() => CameraSpecDto)   camera?: CameraSpecDto;
  @IsOptional() @ValidateNested() @Type(() => NvrSpecDto)      nvr?: NvrSpecDto;
  @IsOptional() @ValidateNested() @Type(() => SwitchSpecDto)   switchDev?: SwitchSpecDto;
  @IsOptional() @ValidateNested() @Type(() => WirelessSpecDto) wireless?: WirelessSpecDto;
  @IsOptional() @ValidateNested() @Type(() => DecoderSpecDto)  decoder?: DecoderSpecDto;
  @IsOptional() @ValidateNested() @Type(() => ScreenSpecDto)   screen?: ScreenSpecDto;
  @IsOptional() @ValidateNested() @Type(() => PcSpecDto)       pc?: PcSpecDto;
}
