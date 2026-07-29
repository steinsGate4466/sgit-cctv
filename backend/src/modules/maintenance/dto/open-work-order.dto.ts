import { IsEmail, IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * APERTURA de la orden en campo — firmada.
 *
 * Es el momento en que el técnico llega al sitio y empieza a trabajar.
 * Se firma porque a partir de aquí todo lo que registre queda a su nombre:
 * en una orden de MAPEO, cada activo levantado se liga a esta orden.
 */
export class OpenWorkOrderDto {
  @IsEmail() email: string;
  @IsString() password: string;

  /**
   * Hora REAL de inicio, la que confirmó por radio con Producción.
   * Si no se envía, se toma el momento de la apertura.
   */
  @IsOptional() @IsISO8601() startedAt?: string;

  /**
   * Acompañante en campo. En planta van dos: el técnico de red registra y el
   * técnico eléctrico acompaña. Queda declarado para trazabilidad y SSOMA.
   */
  @IsOptional() @IsString() companionId?: string;
}
