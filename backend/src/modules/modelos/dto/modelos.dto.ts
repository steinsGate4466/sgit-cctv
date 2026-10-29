import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { AssetType } from '../../../generated/prisma/client';

/** Alta de un modelo en el catálogo: marca y modelo EXACTOS, como en la etiqueta. */
export class CrearModeloDto {
  /* El enum del esquema, no una lista copiada: dos listas se desincronizan. */
  @IsEnum(AssetType, { message: 'Ese tipo de equipo no existe.' })
  tipoActivo!: AssetType;

  @IsString() @MaxLength(60, { message: 'La marca no pasa de 60 letras.' }) @Matches(/\S/, { message: 'Falta la marca.' })
  marca!: string;

  @IsString() @MaxLength(80, { message: 'El modelo no pasa de 80 letras.' }) @Matches(/\S/, { message: 'Falta el modelo.' })
  modelo!: string;
}

/** Lo que se sabe del ciclo de vida del modelo (bloque 32). */
export class EditarModeloDto {
  @IsOptional() @IsDateString({}, { message: 'La fecha de fin de soporte no es una fecha.' }) finDeSoporte?: string | null;
  @IsOptional() @IsBoolean() sinRecambio?: boolean;
  @IsOptional() @IsString() @MaxLength(120, { message: 'El reemplazo no pasa de 120 letras.' }) reemplazadoPor?: string | null;
  @IsOptional() @IsString() @MaxLength(500, { message: 'Las notas no pasan de 500 letras.' }) notas?: string | null;
}

/** Texto de una ficha técnica para el asistente (lo saca el navegador del PDF). */
export class LeerFichaDto {
  @IsString() @MaxLength(200_000, { message: 'El texto de la ficha es demasiado largo.' })
  texto!: string;
}

/**
 * Un número de la ficha, con UN mensaje en castellano para todo lo que puede
 * fallar. Los mensajes por defecto de class-validator salen en inglés y con el
 * nombre interno del campo («anguloH must not be greater than 360»): eso no lo
 * entiende quien está copiando números de un PDF.
 *
 * Llegan en un formulario con archivo (multipart), así que vienen como TEXTO:
 * `Type(() => Number)` los convierte antes de validar.
 */
function Numero(que: string, min: number, max: number, unidad = '') {
  const message = `${que}: un número entre ${min} y ${max}${unidad}.`;
  return applyDecorators(
    Type(() => Number),
    IsNumber({ allowNaN: false, allowInfinity: false }, { message }),
    Min(min, { message }),
    Max(max, { message }),
  );
}

export class DatosFichaDto {
  @IsString() @MaxLength(40, { message: 'La lente no pasa de 40 letras.' })
  @Matches(/\d\s*mm/i, { message: 'La lente se escribe como en la ficha: «2.8 mm» o «2.8-12 mm».' })
  lente!: string;

  @Numero('Resolución horizontal', 320, 16000, ' píxeles') resolucionAncho!: number;
  @Numero('Resolución vertical', 240, 16000, ' píxeles') resolucionAlto!: number;
  @IsOptional() @IsString() @MaxLength(40, { message: 'El sensor no pasa de 40 letras.' }) sensor?: string;

  @Numero('Ángulo horizontal', 0.5, 360, '°') anguloH!: number;
  @IsOptional() @Numero('Ángulo vertical', 0.1, 360, '°') anguloV?: number;
  @IsOptional() @Numero('Ángulo en tele', 0.1, 360, '°') anguloHTele?: number;
  @IsOptional() @Numero('Zoom óptico', 1, 100, 'x') zoomOptico?: number;

  /** A qué ángulo da la ficha sus distancias: gran angular o tele. */
  @IsIn(['GRAN_ANGULAR', 'TELE'], { message: 'Di si las distancias de la ficha son en gran angular o en tele.' })
  doriEn!: 'GRAN_ANGULAR' | 'TELE';

  @Numero('Identificar', 0.1, 10000, ' m') identificarM!: number;
  @Numero('Reconocer', 0.1, 10000, ' m') reconocerM!: number;
  @Numero('Observar', 0.1, 10000, ' m') observarM!: number;
  @Numero('Detectar', 0.1, 10000, ' m') detectarM!: number;
  @IsOptional() @Numero('Alcance infrarrojo', 0, 5000, ' m') irM?: number;
}

/** Corregir los números de una ficha ya cargada (el PDF no cambia). */
export class EditarFichaDto extends DatosFichaDto {}
