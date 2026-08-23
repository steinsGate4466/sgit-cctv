import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderStatus } from '../../../generated/prisma/client';
import { CreateWorkOrderDto } from './create-work-order.dto';

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsString() diagnosis?: string;
  // Checklist de condición del preventivo (limpieza, cableado, etc.). Estructura libre.
  @IsOptional() condition?: any;
}
