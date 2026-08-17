import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

/**
 * DECLARAR CÓMO SE LLEGA A UN EQUIPO — bloque 41.
 *
 * =============================================================================
 *  POR QUÉ LA ALTURA ES OPCIONAL Y EL MEDIO NO
 * =============================================================================
 *  El medio es la declaración: sin él no hay nada que declarar. La altura es
 *  una precisión que ayuda —permite cazar el «se llega a pie» de una cámara a
 *  cuatro metros— pero exigirla tendría un efecto conocido: el técnico que no
 *  la sabe pone un número cualquiera para poder guardar, y entonces el sistema
 *  tiene un dato falso donde antes tenía un hueco honesto.
 *
 *  Un hueco se ve y se pregunta. Un 3 inventado no.
 */
export class DeclararAccesoDto {
  @ApiProperty({
    enum: ['A_PIE', 'ESCALERA', 'ANDAMIO', 'MANLIFT', 'GRUA', 'LINEA_VIDA', 'OTRO'],
    description: 'Cómo se llega físicamente a este equipo.',
  })
  @IsEnum(['A_PIE', 'ESCALERA', 'ANDAMIO', 'MANLIFT', 'GRUA', 'LINEA_VIDA', 'OTRO'] as any, {
    message: 'Elige un medio de acceso de la lista.',
  })
  medioAcceso!: string;

  /**
   * El tope de 120 m no es decorativo: sin él, un dedazo de «85» en vez de
   * «8.5» pasa a la base y sale en el tablero de Producción como un punto
   * inalcanzable. Con tope, el dedazo se ve al guardar.
   */
  @ApiPropertyOptional({ description: 'Altura del punto de montaje, en metros.' })
  @IsOptional()
  @IsNumber({}, { message: 'La altura tiene que ser un número en metros.' })
  @Min(0, { message: 'La altura no puede ser negativa.' })
  @Max(120, { message: 'Revisa la altura: 120 m es más alto que cualquier estructura de la planta.' })
  alturaMetros?: number;

  @ApiPropertyOptional({ description: 'El detalle que no cabe en la lista.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accesoNota?: string;
}
