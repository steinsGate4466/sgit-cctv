import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Resolución firmada de incidencia (retroalimentación para análisis de planta).
export class ResolveIncidentDto {
  @IsOptional() @IsString() solution?: string;        // ¿qué se hizo para resolverlo?
  @IsOptional() @IsString() rootCause?: string;       // causa raíz
  @IsOptional() @IsString() materials?: string;       // materiales utilizados
  @IsOptional() @IsString() interveners?: string;     // técnicos que intervinieron
  @IsOptional() @IsString() responsibleName?: string; // responsable de la solución
  @IsOptional() @IsString() observations?: string;    // observaciones / recomendaciones
  @IsOptional() @IsBoolean() lineManagerNotified?: boolean; // ¿jefe de línea enterado?
  @IsOptional() @IsInt() @Min(0) affectedCameras?: number;  // impacto: cámaras
  @IsOptional() @IsInt() @Min(0) visionDownMin?: number;    // impacto: min sin visión
  @IsEmail() email: string;       // firma
  @IsString() password: string;   // firma
}
