import { IsEnum } from 'class-validator';
import { AssetStatus } from '@prisma/client';

/**
 * Cambio de estado del activo — la ÚNICA edición permitida sin firma.
 *
 * Deliberadamente no extiende de CreateAssetDto: si lo hiciera, cualquier
 * campo nuevo que se agregue al activo en el futuro quedaría editable sin
 * firma por descuido. Aquí se declara uno por uno, a propósito.
 */
export class UpdateAssetStatusDto {
  @IsEnum(AssetStatus) status: AssetStatus;
}
