import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Subir un plano. La imagen va en el campo `archivo` del multipart. */
export class CrearPlanoDto {
  @IsString() @MaxLength(120) nombre!: string;
  @IsString() locationId!: string;
  /** Tamaño real de la imagen, medido por el navegador al cargarla. */
  @Type(() => Number) @IsInt() @Min(100) @Max(20000) anchoPx!: number;
  @Type(() => Number) @IsInt() @Min(100) @Max(20000) altoPx!: number;
  @IsOptional() @IsString() @MaxLength(600) notas?: string;
}

export class CalibrarPlanoDto {
  @IsNumber() x1!: number;
  @IsNumber() y1!: number;
  @IsNumber() x2!: number;
  @IsNumber() y2!: number;
  @IsNumber() @Min(0.01) @Max(5000) metros!: number;
  @IsOptional() @IsNumber() @Min(-360) @Max(360) rotacionNorte?: number;
}

export class ColocarEquipoDto {
  @IsNumber() xPx!: number;
  @IsNumber() yPx!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(200) alturaM?: number;
  @IsOptional() @IsNumber() @Min(-360) @Max(360) rumbo?: number;
  @IsOptional() @IsNumber() @Min(5) @Max(360) anguloVision?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(500) alcanceM?: number;
  /** Bloque 184 · a qué zoom queda (PTZ / varifocal). 1 = gran angular. */
  @IsOptional() @IsNumber() @Min(1) @Max(100) zoom?: number;
}

/** Bloque 165 · el polígono de una zona, en píxeles de la imagen: [[x, y], …]. */
export class ZonaDto {
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(60) puntos!: [number, number][];
}

/** Bloque 176 · un área de riesgo dibujada. El servicio vuelve a validar todo. */
export class RiesgoDto {
  @IsIn(['ALTO_RIESGO', 'ALTURA', 'ELECTRICO', 'CALOR', 'VITAL'], { message: 'Elige el nivel del área.' }) nivel!: string;
  @IsString() @MaxLength(80) nombre!: string;
  @IsString() @MaxLength(500) motivo!: string;
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(60) puntos!: [number, number][];
}

/** Bloque 176 · quitar un área de riesgo exige decir por qué. */
export class QuitarRiesgoDto {
  @IsString() @MaxLength(500) motivo!: string;
}

/** Bloque 176 · los puntos intermedios del cable, del switch al equipo. */
export class TrazadoDto {
  @IsArray() @ArrayMaxSize(60) puntos!: [number, number][];
}
