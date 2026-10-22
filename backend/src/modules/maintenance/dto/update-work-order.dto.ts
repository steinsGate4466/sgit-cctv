import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkOrderStatus } from '../../../generated/prisma/client';
import { CreateWorkOrderDto } from './create-work-order.dto';

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsString() diagnosis?: string;
  // Checklist de condición del preventivo (limpieza, cableado, etc.). Estructura libre.
  @IsOptional() condition?: any;
  /* AUDITORÍA DE PROCESOS 21/10 · «Registrar intervención» ya preguntaba qué
     se encontró y qué se hizo, pero lo guardaba sólo como TEXTO del
     diagnóstico: al cerrar, el Jefe lo volvía a elegir de la lista. Ahora va
     también el CÓDIGO, como propuesta que el cierre trae marcada. */
  @IsOptional() @IsString() @MaxLength(60) symptomCode?: string;
  @IsOptional() @IsString() @MaxLength(60) actionCode?: string;
}
