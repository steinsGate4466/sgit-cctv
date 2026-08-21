import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export const TIPOS_SITIO = [
  'OFICINA', 'PULPITO', 'GRUA', 'SALA_ELECTRICA', 'NAVE', 'PATIO',
  'ALMACEN', 'CASETA', 'SUBESTACION', 'LABORATORIO', 'OTRO',
] as const;

export const TIPOS_EQUIPO = [
  'CAMERA', 'NVR', 'SWITCH', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER',
  'UPS', 'FIBER', 'CABINET', 'DECODER', 'PC', 'PANTALLA', 'OTHER',
] as const;

export const AMBIENTES = [
  'CALOR_RADIANTE', 'VAPOR_AGUA', 'POLVO_METALICO', 'INTEMPERIE_SALINA',
  'EMI_ALTA', 'CLIMATIZADO',
] as const;

/**
 * SOLICITAR: lo mínimo. Quien pide una cámara no sabe cuántos metros de
 * cable hacen falta, y no tiene por qué saberlo. Pedírselo sólo consigue que
 * invente un número que después alguien toma por bueno.
 */
export class CrearInstalacionDto {
  @IsIn(TIPOS_SITIO as unknown as string[]) tipoSitio!: string;
  @IsIn(TIPOS_EQUIPO as unknown as string[]) tipoEquipo!: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) cantidad?: number;
  @IsOptional() @IsIn(['T1', 'T2', 'T3']) tren?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() @MaxLength(200) referenciaSitio?: string;
  @IsOptional() @IsString() @MaxLength(600) comoLlegar?: string;
  @IsString() @MinLength(10) @MaxLength(800) justificacion!: string;
  @IsOptional() @IsString() @MaxLength(80) solicitadaPor?: string;
  @IsOptional() @IsString() @MaxLength(80) areaSolicitante?: string;
  @IsOptional() @IsString() @MaxLength(600) notas?: string;
}

/**
 * EVALUAR: todo lo que se mide EN EL SITIO. Todos opcionales aquí; el
 * servicio exige los que pide el perfil del tipo de sitio, para poder
 * guardar a medias durante la visita y terminar después.
 */
export class EvaluarInstalacionDto {
  @IsOptional() @IsBoolean() hayEnergia?: boolean;
  @IsOptional() @IsString() @MaxLength(60) tipoEnergia?: string;
  @IsOptional() @IsBoolean() hayPuntoRed?: boolean;
  @IsOptional() @IsString() @MaxLength(80) gabineteCercano?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(5000) metrosCable?: number;
  @IsOptional() @IsString() @MaxLength(400) rutaCable?: string;
  @IsOptional() @IsBoolean() necesitaPoe?: boolean;
  @IsOptional() @IsString() switchDestinoId?: string;
  @IsOptional() @IsString() nvrDestinoId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(256) canalNvr?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(200) alturaMetros?: number;
  @IsOptional() @IsBoolean() necesitaManlift?: boolean;
  @IsOptional() @IsBoolean() necesitaAndamio?: boolean;
  @IsOptional() @IsBoolean() necesitaParada?: boolean;
  @IsOptional() @IsBoolean() necesitaLoto?: boolean;
  @IsOptional() @IsBoolean() necesitaPermisoAltura?: boolean;
  @IsOptional() @IsBoolean() necesitaPermisoCaliente?: boolean;
  @IsOptional() @IsString() @MaxLength(600) riesgos?: string;
  @IsOptional() @IsString() @MaxLength(120) quienAutoriza?: string;

  @IsOptional() @IsString() @MaxLength(60) gruaNombre?: string;
  @IsOptional() @IsBoolean() gruaSeDetiene?: boolean;
  @IsOptional() @IsBoolean() porCadenaPortacables?: boolean;
  @IsOptional() @IsBoolean() porAntena?: boolean;
  @IsOptional() @IsString() @MaxLength(80) antenaModelo?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(20000) distanciaEnlaceM?: number;
  @IsOptional() @IsBoolean() hayLineaVista?: boolean;

  @IsOptional() @IsBoolean() hayFalsoTecho?: boolean;
  @IsOptional() @IsBoolean() hayCanaleta?: boolean;
  @IsOptional() @IsBoolean() esClimatizado?: boolean;
  @IsOptional() @IsString() @MaxLength(120) pantallaExistente?: string;
  @IsOptional() @IsString() @MaxLength(80) puestoOperador?: string;

  @IsOptional() @IsIn(AMBIENTES as unknown as string[]) ambiente?: string;
  @IsOptional() @IsBoolean() necesitaGabineteEstanco?: boolean;
  @IsOptional() @IsString() @MaxLength(20) gradoIpRequerido?: string;

  @IsOptional() @IsString() @MaxLength(1500) materialesEstimados?: string;
  /* costoEstimado y moneda RETIRADOS en el bloque 47. El sistema no pone
     precio a nada: cuenta materiales, metros y subidas de manlift. Si llegan
     en el cuerpo de la petición, el ValidationPipe los descarta por
     whitelist, así que tampoco se pueden colar a mano. */

  @IsOptional() @IsString() @MaxLength(600) notas?: string;
  /** true = cerrar la evaluación. false o ausente = guardar borrador. */
  @IsOptional() @IsBoolean() cerrarEvaluacion?: boolean;
}

export class DecidirInstalacionDto {
  @IsBoolean() aprobar!: boolean;
  @IsOptional() @IsString() @MaxLength(400) motivo?: string;
}

/** Al terminar: nace el activo. */
export class InstaladaDto {
  @IsString() @MinLength(3) @MaxLength(40) assetCode!: string;
  @IsOptional() @IsString() @MaxLength(60) brand?: string;
  @IsOptional() @IsString() @MaxLength(60) modelo?: string;
  @IsOptional() @IsString() @MaxLength(60) serialNumber?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() @MaxLength(600) notas?: string;
}
