import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccesoService } from './acceso.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('acceso')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('acceso-dispositivos')
export class AccesoController {
  constructor(private readonly acceso: AccesoService) {}

  @Get('resumen')
  @RequirePermissions('user.manage')
  resumen() {
    return this.acceso.resumen();
  }

  @Get()
  @RequirePermissions('user.manage')
  listar(@Query('estado') estado?: string) {
    return this.acceso.listar(estado);
  }

  @Post('modo')
  @RequirePermissions('user.manage')
  modo(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.acceso.cambiarModo(dto?.modo, u?.userId, ip);
  }

  @SinAmbito()  // un dispositivo no pertenece a ningún tren
  @Patch(':id')
  @RequirePermissions('user.manage')
  decidir(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.acceso.decidir(id, dto?.estado, dto || {}, u?.userId, ip);
  }
}
