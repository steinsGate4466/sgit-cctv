import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const TRENES = ['T1', 'T2', 'T3'] as const;
export const ESTADOS = ['ANUNCIADA', 'CONFIRMADA', 'EN_CURSO', 'TERMINADA', 'CANCELADA'] as const;
export const ORIGENES = ['PRODUCCION', 'MANTENIMIENTO', 'FALLA', 'PROGRAMADA'] as const;

export class CrearParadaDto {
  @IsIn(TRENES as unknown as string[]) tren!: string;
  @IsDateString() inicioPrevisto!: string;
  @IsOptional() @IsDateString() finPrevisto?: string;
  @IsOptional() @IsInt() @Min(5) @Max(20160) duracionPrevMin?: number;
  @IsOptional() @IsIn(ORIGENES as unknown as string[]) origen?: string;
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
  /** Quién avisó. En planta esto llega por radio: dejarlo escrito lo vuelve un dato. */
  @IsOptional() @IsString() @MaxLength(80) avisadoPor?: string;
  @IsOptional() @IsString() @MaxLength(40) canalAviso?: string;
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
}

/**
 * MOVER LA PARADA. El motivo es OBLIGATORIO.
 *
 * Producción mueve la hora dos y tres veces, muchas veces con media hora de
 * aviso. Exigir el motivo cuesta cinco segundos y es lo que convierte
 * «siempre nos mueven la parada» en «nos la movieron 14 veces este mes, 9 por
 * cambio de programa». Lo primero es una queja; lo segundo se puede llevar a
 * una reunión.
 */
export class MoverParadaDto {
  @IsOptional() @IsDateString() inicioPrevisto?: string;
  @IsOptional() @IsDateString() finPrevisto?: string;
  @IsOptional() @IsInt() @Min(5) @Max(20160) duracionPrevMin?: number;
  @IsString() @MaxLength(300) motivo!: string;
}

export class EstadoParadaDto {
  @IsIn(ESTADOS as unknown as string[]) estado!: string;
  @IsOptional() @IsDateString() inicioReal?: string;
  @IsOptional() @IsDateString() finReal?: string;
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
}

export class LigarOrdenDto {
  @IsString() workOrderId!: string;
  /** false para desligar. */
  @IsOptional() @IsBoolean() ligar?: boolean;
}
