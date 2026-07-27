import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentStatus } from '@prisma/client';
import { CreateIncidentDto } from './create-incident.dto';

export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() responsibleId?: string;
  // Propuesta técnica de solución (documentación previa al cierre).
  @IsOptional() @IsString() proposal?: string;
  @IsOptional() @IsString() proposalCost?: string;
  @IsOptional() @IsString() proposalRisk?: string;
  @IsOptional() @IsBoolean() requiresThirdParty?: boolean;
}
