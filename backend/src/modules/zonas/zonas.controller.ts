import { Body, Controller, Get, Ip, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZonasService } from './zonas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('zonas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('zonas')
export class ZonasController {
  constructor(private readonly zonas: ZonasService) {}

  /* LEER es de todos los que ven la planta —TI y Mantenimiento necesitan
     saber POR QUÉ una zona pesa—; DECLARAR es sólo de Producción. Ésa es la
     integración de las tres áreas: una decide, las otras dos la ven. */

  @SinAmbito() // el árbol completo, también para quien tiene un solo tren
  @Get()
  @RequirePermissions('location.read')
  listar() { return this.zonas.listar(); }

  @SinAmbito()
  @Get('pendientes')
  @RequirePermissions('location.read')
  pendientes() { return this.zonas.pendientes(); }

  @SinAmbito()
  @Patch(':id')
  @RequirePermissions('zona.criticidad')
  declarar(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.zonas.declarar(id, dto, u?.userId, ip);
  }
}
