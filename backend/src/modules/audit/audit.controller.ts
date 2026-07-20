import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Protegido por guard global (JWT) + permiso audit.read.
  @Get()
  @RequirePermissions('audit.read')
  findAll(@Query() q: QueryAuditDto) {
    return this.audit.findMany(q);
  }
}
