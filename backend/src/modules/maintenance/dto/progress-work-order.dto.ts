import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Reporte de AVANCE de una orden en curso.
 *
 * Una orden no siempre se termina el mismo día: la parada se acorta porque
 * Producción reinicia antes, falta el manlift, no llega el repuesto. En vez de
 * forzar un cierre falso, el técnico deja el avance y el motivo.
 */
export class ProgressWorkOrderDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100)
  pct: number;

  /**
   * Por qué no se avanzó más. Es el dato que justifica ante el Jefe de
   * Mantenimiento por qué un trabajo tomó tres paradas.
   */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
