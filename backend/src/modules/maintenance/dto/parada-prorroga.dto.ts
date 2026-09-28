import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** Bloque 138 · «empezó la parada» / «terminó la parada». */
export class EventoParadaDto {
  @IsIn(['INICIO', 'FIN']) evento!: 'INICIO' | 'FIN';
  /** Si no viene, es ahora. Se puede declarar con retraso (lo dijo la radio). */
  @IsOptional() @IsISO8601() hora?: string;
}

/** Bloque 135 · el técnico pide mover la fecha. */
export class PedirProrrogaDto {
  @IsISO8601() fechaPedida!: string;
  @IsString() @MaxLength(500) motivo!: string;
}

/** Bloque 135 · el supervisor la aprueba o la rechaza. */
export class ResolverProrrogaDto {
  @IsOptional() @IsString() @MaxLength(500) nota?: string;
}
