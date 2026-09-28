import { IsBoolean } from 'class-validator';

/** Bloque 143 · encender o apagar la generación automática de preventivos. */
export class CambiarAutogenDto {
  @IsBoolean() activo!: boolean;
}
