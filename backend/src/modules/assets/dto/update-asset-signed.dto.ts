import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateAssetDto } from './update-asset.dto';
import {
  CameraSpecDto, NvrSpecDto, SwitchSpecDto, WirelessSpecDto,
  DecoderSpecDto, ScreenSpecDto, PcSpecDto,
} from './asset-specs.dto';

/**
 * Edición FIRMADA de activo, incluida su ficha por tipo.
 * Editar un activo toca información sensible: exige re-autenticación y queda
 * auditada. Visible para Jefe de Mantenimiento, Supervisor TI y Técnico de Red.
 */
export class SignedUpdateAssetDto extends UpdateAssetDto {
  @IsEmail() email: string;
  @IsString() password: string;

  @IsOptional() @ValidateNested() @Type(() => CameraSpecDto)   camera?: CameraSpecDto;
  @IsOptional() @ValidateNested() @Type(() => NvrSpecDto)      nvr?: NvrSpecDto;
  @IsOptional() @ValidateNested() @Type(() => SwitchSpecDto)   switchDev?: SwitchSpecDto;
  @IsOptional() @ValidateNested() @Type(() => WirelessSpecDto) wireless?: WirelessSpecDto;
  @IsOptional() @ValidateNested() @Type(() => DecoderSpecDto)  decoder?: DecoderSpecDto;
  @IsOptional() @ValidateNested() @Type(() => ScreenSpecDto)   screen?: ScreenSpecDto;
  @IsOptional() @ValidateNested() @Type(() => PcSpecDto)       pc?: PcSpecDto;
}
