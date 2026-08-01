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
  /**
   * Motivo ELEGIDO de la lista (catálogo MOTIVO_AVANCE). Escrito a mano no se
   * podía contar; ahora se puede saber cuántas paradas se pierden por falta de
   * repuesto y cuántas por falta de manlift, que son dos problemas distintos
   * con dos soluciones distintas.
   */
  @IsOptional() @IsString() @MaxLength(60) reasonCode?: string;

  /** Detalle libre, opcional. Lo que la lista no prevé. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
