import { Body, Controller, Get, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurgaService } from './purga.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurgarDto, PurgarAuditoriaDto } from './dto/purga.dto';

/**
 * Todo lo de aquí es IRREVERSIBLE, así que se usa POST incluso para las
 * vistas previas que no cambian nada: mantiene el patrón "nada de purga se
 * dispara desde un enlace" — un GET se puede provocar desde una imagen o un
 * enlace en otra web.
 */
@ApiTags('purga')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purga')
export class PurgaController {
  constructor(private readonly purga: PurgaService) {}

  /** Literales antes que parámetros, como siempre. */
  @Get('candidatos')
  @RequirePermissions('asset.delete')
  candidatos() {
    return this.purga.candidatosBasura();
  }

  @Get('activo/:id')
  @RequirePermissions('asset.delete')
  previaActivo(@Param('id') id: string) {
    return this.purga.vistaPreviaActivo(id);
  }

  @Post('activo/:id')
  @RequirePermissions('asset.delete')
  purgarActivo(@Param('id') id: string, @Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarActivo(id, dto.confirmacion, u?.userId, ip);
  }

  @Get('usuario/:id')
  @RequirePermissions('user.manage')
  previaUsuario(@Param('id') id: string) {
    return this.purga.vistaPreviaUsuario(id);
  }

  @Post('usuario/:id')
  @RequirePermissions('user.manage')
  purgarUsuario(@Param('id') id: string, @Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarUsuario(id, dto.confirmacion, u?.userId, ip);
  }

  @Get('auditoria')
  @RequirePermissions('audit.read')
  previaAuditoria(@Query('antesDe') antesDe: string) {
    return this.purga.vistaPreviaAuditoria(antesDe);
  }

  @Post('auditoria')
  @RequirePermissions('audit.read')
  purgarAuditoria(@Body() dto: PurgarAuditoriaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarAuditoria(dto.antesDe, dto.confirmacion, u?.userId, ip);
  }
}
