import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
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
  /* «A mi cargo» (bloque 148): las órdenes donde el TÉCNICO asignado soy yo.
     Es la pantalla con la que entra el técnico: sus trabajos, no los 300 de
     la planta. Se transforma igual que `mias`, por el mismo motivo. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() asignadas?: boolean;
  /* Síntesis 21/10 · «Mi tren»: las órdenes VIVAS (ni cerradas ni canceladas).
     La pantalla pedía `status=ABIERTA` y se perdía todo lo EN_PROCESO y
     EN_ESPERA: decía «nada pendiente» con cuatro órdenes en marcha. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() vivas?: boolean;
  /* Bloque 164 · «Ver en Órdenes» desde Indicadores/Dashboard: las MISMAS que
     contó el reparto. `creadasDesde` va sobre la fecha de CREACIÓN (el reparto
     cuenta por creación; `from`/`to` van sobre la programada). */
  @IsOptional() @IsString() creadasDesde?: string;
  @IsOptional() @IsIn(['AUTOMATICA', 'INCIDENCIA', 'MANUAL']) origen?: 'AUTOMATICA' | 'INCIDENCIA' | 'MANUAL';
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() sinCanceladas?: boolean;
  /* Bloque 165 · «las órdenes de esta zona» desde el Mapa: el id de la
     ubicación de la zona (sala eléctrica, púlpito…) y todo lo que cuelga. */
  @IsOptional() @IsString() zona?: string;
  /* Bloque 180 · las vivas sin N° de OM SAP: lo que espera a que alguien la
     cree en SAP. Es el bloque de la bandeja. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean() sinSap?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
