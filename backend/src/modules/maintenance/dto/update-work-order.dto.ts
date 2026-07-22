import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';
import { CreateWorkOrderDto } from './create-work-order.dto';

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @IsOptional() @IsEnum(WorkOrderStatus) status?: WorkOrderStatus;
  @IsOptional() @IsString() diagnosis?: string;
}
