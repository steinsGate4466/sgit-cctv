import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SwitchRole, WirelessMode, MgmtNetwork, ScreenLayout, ScreenSource,
} from '../../../generated/prisma/client';

/**
 * FICHAS POR TIPO DE ACTIVO.
 *
 * Antes el alta solo escribía el activo base: las tablas asset_cameras,
 * asset_nvrs, asset_switches y asset_wireless existían en la base pero NO había
 * forma de escribirlas desde la aplicación. Es decir, era imposible registrar
 * una cámara con su canal, su IP o de qué antena cuelga —justo lo que hay que
 * mapear—.
 *
 * Cada tipo declara sus campos por separado, a propósito: una cámara no tiene
 * presupuesto PoE y un switch no tiene canal de grabador. Un formulario único
 * para todos es lo que hacía ilegible la información.
 *
 * TODOS los campos son opcionales: el técnico guarda en campo con lo mínimo y
 * completa después. Si el formulario obliga demasiado, el técnico inventa datos
 * para poder guardar, y eso es peor que dejarlo vacío.
 */

export class CameraSpecDto {
  @IsOptional() @IsString() @MaxLength(40) resolution?: string;
  @IsOptional() @IsString() @MaxLength(60) cameraUser?: string;
  @IsOptional() @IsString() @MaxLength(200) rtspUrl?: string;
  @IsOptional() @IsString() @MaxLength(45) ipAddress?: string;
  @IsOptional() @IsString() @MaxLength(20) macAddress?: string;
  @IsOptional() @IsString() vlanId?: string;
  /** Grabador al que entra la señal. */
  @IsOptional() @IsString() nvrId?: string;
  /** Canal del grabador. Sin él no hay mapa de canales. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(256) nvrChannel?: number;
  /**
   * Nombre tal como se ve en el grabador y en la pantalla del púlpito.
   * Es el idioma común: el operador dice "la de la grúa 2", no el código.
   */
  @IsOptional() @IsString() @MaxLength(120) nvrName?: string;
  /** Fija, domo, PTZ, bullet, térmica. */
  @IsOptional() @IsString() @MaxLength(40) cameraStyle?: string;
  /** Antena por la que cuelga (suscriptora o PMP base). */
  @IsOptional() @IsString() wirelessUplinkId?: string;
  /** Puerto del que recibe ENERGÍA. Distinto del puerto de datos. */
  @IsOptional() @IsString() poeSourcePortId?: string;
}

export class NvrSpecDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(512) channels?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) diskCount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacityTb?: number;
  @IsOptional() @IsBoolean() hasLocalDisk?: boolean;
  /** Switch al que va conectado directo (varios NVR van así). */
  @IsOptional() @IsString() switchIdDirect?: string;
  /** LAN1 — red de cámaras (192.x en Pisco). */
  @IsOptional() @IsString() @MaxLength(45) nicPrimary?: string;
  /** LAN2 — red de gestión (10.x). Es la ÚNICA alcanzable por ping. */
  @IsOptional() @IsString() @MaxLength(45) nicSecondary?: string;
}

export class SwitchSpecDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(256) portCount?: number;
  /** Cuántos de esos puertos entregan PoE. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(256) poePorts?: number;
  /** Presupuesto PoE total en watts. Agotarlo causa caídas intermitentes. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) poeBudgetW?: number;
  @IsOptional() @IsString() @MaxLength(45) mgmtIp?: string;
  /** En qué red vive esa IP: define si el servidor la alcanza. */
  @IsOptional() @IsEnum(MgmtNetwork) mgmtNetwork?: MgmtNetwork;
  @IsOptional() @IsString() @MaxLength(60) vendor?: string;
  @IsOptional() @IsEnum(SwitchRole) switchRole?: SwitchRole;
}

export class WirelessSpecDto {
  @IsOptional() @IsString() @MaxLength(60) vendor?: string;
  @IsOptional() @IsString() @MaxLength(30) frequency?: string;
  @IsOptional() @IsEnum(WirelessMode) mode?: WirelessMode;
  /** AP del que cuelga (la PMP base). */
  @IsOptional() @IsString() parentWirelessId?: string;
  @IsOptional() @IsString() @MaxLength(60) ssid?: string;
  /** ¿Tenemos la clave? Hay antenas en planta de las que nadie la tiene. */
  @IsOptional() @IsBoolean() hasCredentials?: boolean;
  @IsOptional() @IsString() @MaxLength(120) originPoint?: string;
  @IsOptional() @IsString() @MaxLength(120) destPoint?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-120) @Max(0) signalDbm?: number;
  @IsOptional() @IsBoolean() linkStable?: boolean;
}

export class DecoderSpecDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(64) outputCount?: number;
  /** Grabador del que consume el video. */
  @IsOptional() @IsString() sourceNvrId?: string;
  @IsOptional() @IsString() @MaxLength(45) mgmtIp?: string;
}

export class ScreenSpecDto {
  /** Rótulo con el que la llaman en el púlpito: "Pantalla 1". */
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) sizeInch?: number;
  @IsOptional() @IsEnum(ScreenLayout) layout?: ScreenLayout;
  /** ¿La alimenta un decodificador o el PC del púlpito? */
  @IsOptional() @IsEnum(ScreenSource) sourceKind?: ScreenSource;
  @IsOptional() @IsString() sourcePcAssetId?: string;
}

export class PcSpecDto {
  @IsOptional() @IsString() @MaxLength(60) hostname?: string;
  @IsOptional() @IsString() @MaxLength(60) os?: string;
  @IsOptional() @IsString() @MaxLength(40) ivmsVersion?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(16) videoOutputs?: number;
  /** Qué grabadores tiene configurados. Se pierde al reinstalar el equipo. */
  @IsOptional() @IsString() @MaxLength(500) nvrsConfigured?: string;
}
