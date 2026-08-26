import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { IncidentCategory, Priority } from '../../../generated/prisma/client';

export class CreateIncidentDto {
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(IncidentCategory) category?: IncidentCategory;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() zone?: string;   // área/zona (Horno, Laminación, Púlpito...)
  @IsOptional() @IsInt() concurrentSessions?: number;
  @IsOptional() @IsInt() affectedCameras?: number;
  @IsOptional() @IsInt() visionDownMin?: number;

  /* CUÁNDO SE CAYÓ DE VERDAD — bloque 68.
     -------------------------------------------------------------------------
     No es lo mismo que cuándo se reportó, y confundirlas hace mentir al MTTR:
     una cámara que se apaga a las 3 de la madrugada y se reporta a las 8
     carga cinco horas que nadie podía atender.

     OPCIONAL a propósito. La mayoría de las veces no se sabe la hora exacta, y
     un campo obligatorio que no se sabe se rellena con cualquier cosa — que es
     peor que dejarlo vacío, porque un dato inventado no se distingue de uno
     bueno. Vacío significa «se usa la de reporte», que es la mejor estimación
     que hay. */
  @IsOptional() @IsDateString() occurredAt?: string;
}
