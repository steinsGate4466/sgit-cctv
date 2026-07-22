import { Body, Controller, Delete, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Post()
  @RequirePermissions('credential.manage')
  create(@Body() dto: CreateCredentialDto) {
    return this.credentials.create(dto);
  }

  // Lista credenciales de un activo (sin secreto). ?assetId=...
  @Get()
  @RequirePermissions('credential.read')
  findByAsset(@Query('assetId') assetId: string) {
    return this.credentials.findByAsset(assetId);
  }

  // Revela el secreto descifrado (permiso elevado + auditado).
  // Revelar (auditado): permitido a los 3 roles con acceso a datos sensibles
  // (Jefe de Mantenimiento, Supervisor TI, Técnico de Red) → permiso credential.read.
  @Get(':id/reveal')
  @RequirePermissions('credential.read')
  reveal(@Param('id') id: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.credentials.reveal(id, user?.userId, ip);
  }

  @Delete(':id')
  @RequirePermissions('credential.manage')
  remove(@Param('id') id: string) {
    return this.credentials.remove(id);
  }
}
