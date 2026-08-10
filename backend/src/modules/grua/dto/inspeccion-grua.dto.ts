import {
  IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Espejo de los enums del esquema. Se declaran aquí para no importar
 *  `@prisma/client` en el DTO: mantiene el DTO legible y sin dependencia. */
export const ESTADOS = ['NO_REVISADO', 'CONFORME', 'OBSERVADO', 'NO_CONFORME'] as const;
export const RESULTADOS = [
  'OPERATIVA', 'OPERATIVA_CON_OBSERVACIONES', 'FUERA_DE_SERVICIO', 'NO_SE_PUDO_ACCEDER',
] as const;

/**
 * DTO de verdad, no `@Body() dto: any`.
 *
 * Los números llegan de `<input type="number">`, que manda TEXTO. Sin
 * `@Type(() => Number)` entraría "-65" como cadena y las comparaciones de
 * señal darían resultados que parecen correctos hasta que no lo son.
 *
 * Los booleanos llegan de casillas y en JSON ya son booleanos de verdad, así
 * que ahí no hace falta transformar.
 */
export class CrearInspeccionGruaDto {
  @IsString() assetId!: string;

  @IsString() @MaxLength(120) grua!: string;
  @IsOptional() @IsString() @MaxLength(120) posicionEnGrua?: string;
  @IsOptional() @IsString() workOrderId?: string;

  // ---- acceso ----
  @IsOptional() @IsBoolean() requiereManlift?: boolean;
  @IsOptional() @Type(() => Number) @Min(0) @Max(200) alturaMetros?: number;
  @IsOptional() @IsBoolean() seBajaAPiso?: boolean;
  @IsOptional() @IsBoolean() requiereParada?: boolean;
  @IsOptional() @IsString() accessRequestId?: string;

  // ---- cámara ----
  @IsOptional() @IsEnum(ESTADOS as any) camaraEstado?: string;
  @IsOptional() @IsString() @MaxLength(600) camaraObs?: string;
  @IsOptional() @IsBoolean() lenteSucio?: boolean;
  @IsOptional() @IsBoolean() carcasaDanada?: boolean;
  @IsOptional() @IsBoolean() soporteFlojo?: boolean;

  // ---- antena ----
  @IsOptional() @IsString() antenaAssetId?: string;
  @IsOptional() @IsEnum(ESTADOS as any) antenaEstado?: string;
  /** dBm de un radioenlace: siempre negativo. -30 es pegado, -95 es nada. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100) @Max(0) senalDbm?: number;
  @IsOptional() @IsBoolean() antenaAlineada?: boolean;
  @IsOptional() @IsString() @MaxLength(600) antenaObs?: string;

  // ---- cableado ----
  @IsOptional() @IsEnum(ESTADOS as any) cableEstado?: string;
  @IsOptional() @IsBoolean() enCadenaPortacables?: boolean;
  @IsOptional() @IsBoolean() chicoteDanado?: boolean;
  @IsOptional() @IsBoolean() prensaestopaOk?: boolean;
  @IsOptional() @IsBoolean() conectorOxidado?: boolean;
  @IsOptional() @Type(() => Number) @Min(0) @Max(2000) metrosAproximados?: number;
  @IsOptional() @IsString() @MaxLength(600) cableObs?: string;

  // ---- alimentación ----
  @IsOptional() @IsEnum(ESTADOS as any) alimentacionEstado?: string;
  @IsOptional() @IsBoolean() poe?: boolean;
  @IsOptional() @IsString() fuenteAssetId?: string;
  @IsOptional() @IsString() @MaxLength(600) alimentacionObs?: string;

  // ---- grabación ----
  @IsOptional() @IsBoolean() grabadorLocal?: boolean;
  @IsOptional() @IsString() nvrAssetId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(256) canalNvr?: number;
  @IsOptional() @IsBoolean() grabaOk?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(400) diasRetencion?: number;
  @IsOptional() @IsString() @MaxLength(600) grabacionObs?: string;

  // ---- gabinete ----
  @IsOptional() @IsEnum(ESTADOS as any) gabineteEstado?: string;
  @IsOptional() @IsBoolean() gabineteHermetico?: boolean;
  @IsOptional() @IsString() @MaxLength(600) gabineteObs?: string;

  // ---- resultado ----
  @IsOptional() @IsEnum(RESULTADOS as any) resultado?: string;
  @IsOptional() @IsString() @MaxLength(2000) hallazgos?: string;
  @IsOptional() @IsString() @MaxLength(2000) accionesRealizadas?: string;
  @IsOptional() @IsBoolean() requiereSeguimiento?: boolean;
  @IsOptional() @IsISO8601() proximaRevision?: string;
}
