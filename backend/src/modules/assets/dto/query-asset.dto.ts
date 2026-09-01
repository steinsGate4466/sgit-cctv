import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType, AssetStatus } from '../../../generated/prisma/client';

export class QueryAssetDto {
  @IsOptional() @IsEnum(AssetType) type?: AssetType;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() cabinetId?: string;
  @IsOptional() @IsString() search?: string;

  // ---- Ámbito de planta (3B-2) ----
  // Código de la ubicación de tipo TREN y código de la etapa del proceso.
  // No son columnas del activo: se resuelven contra el árbol.
  @IsOptional() @IsString() tren?: string;
  @IsOptional() @IsString() etapa?: string;

  // ---- Paginación (F9) ----
  // Sin esto el listado traía el inventario completo en cada apertura.
  // @Type convierte el texto de la URL a número; sin él la validación falla
  // porque los parámetros de consulta siempre llegan como cadena.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize?: number;

  /* ---- ESTRUCTURA DE ACTIVOS (bloque 81) ----
     La letra A/B/C NO es una columna: se recalcula en cada consulta a partir
     del árbol de planta, las vecinas y el historial. Por eso el filtro NO
     puede ir en el `where` de Prisma — se aplica DESPUÉS, sobre la página ya
     enriquecida.

     Consecuencia que hay que saber: filtrando por letra, el total y el
     paginador se calculan sobre lo filtrado, no sobre la tabla. Se dice en
     pantalla para que nadie lea «12 activos» pensando que son todos. */
  @IsOptional() @IsString() letra?: string;

  /* Cómo se ordena. Por defecto, POR CRITICIDAD: es la pregunta con la que se
     abre esta pantalla —«¿qué es lo importante?»— y una lista alfabética de
     cuatrocientas filas no la contesta. */
  @IsOptional() @IsString() orden?: string;
}
