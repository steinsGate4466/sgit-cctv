import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { WorkOrderStatus, WorkOrderType } from '../../../generated/prisma/client';

export class QueryWorkOrderDto {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsEnum(WorkOrderType) type?: WorkOrderType;
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() q?: string;    // texto: código OM, código incidencia, actividad, zona
  @IsOptional() @IsString() from?: string; // ISO (desde) sobre fecha programada
  @IsOptional() @IsString() to?: string;   // ISO (hasta) sobre fecha programada
  // ---- Ámbito de planta (3B-2) ----
  @IsOptional() @IsString() tren?: string;
  @IsOptional() @IsString() etapa?: string;
  /* «Sólo las que he pedido yo» (bloque 94). Llega como texto desde la URL
     —`?mias=1`—, así que se transforma aquí y no se compara contra la cadena
     'true' en el servicio: dos sitios interpretando el mismo parámetro acaban
     discrepando. `@Transform` corre ANTES de la validación. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() mias?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
